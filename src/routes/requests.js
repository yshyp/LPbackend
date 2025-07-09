const express = require('express');
const { body, validationResult } = require('express-validator');
const BloodRequest = require('../models/BloodRequest');
const User = require('../models/User');
const { auth, isDonor, isRequester } = require('../middleware/auth');
const { sendMulticastNotification, sendNotification } = require('../config/firebase');
const { logUserActivity, logError, logSecurity, logSystemEvent } = require('../services/loggerService');
const ChatMessage = require('../models/ChatMessage');
const { sendChatMessageNotification } = require('../services/notificationService');

const router = express.Router();

// Helper function to get request info
const getRequestInfo = (req) => ({
  ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
  userAgent: req.get('User-Agent'),
  method: req.method,
  path: req.path
});

// Validation for creating a blood request
const createRequestValidation = [
  body('bloodGroup')
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .withMessage('Please select a valid blood group'),
  body('units')
    .isInt({ min: 1, max: 10 })
    .withMessage('Units must be between 1 and 10'),
  body('hospitalName')
    .isLength({ min: 2, max: 100 })
    .withMessage('Hospital name is required'),
  body('hospitalAddress')
    .isLength({ min: 2, max: 200 })
    .withMessage('Hospital address is required'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('requiredBy')
    .isISO8601()
    .withMessage('Required by date is required'),
  body('urgency')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    .withMessage('Invalid urgency')
];

// @route   GET /api/requests
// @desc    List nearby requests (for donors)
// @access  Private (Donors only)
router.get('/', auth, isDonor, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const { longitude, latitude, maxDistance = 20000, bloodGroup } = req.query;
    
    if (!longitude || !latitude) {
      logSecurity('requests_list_missing_coordinates', {
        userId: req.user.userId,
        phone: req.user.phone,
        query: req.query,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'Longitude and latitude are required' });
    }

    // Validate coordinates are not 0,0 (invalid location)
    if (parseFloat(longitude) === 0 && parseFloat(latitude) === 0) {
      logSecurity('requests_list_invalid_coordinates', {
        userId: req.user.userId,
        phone: req.user.phone,
        query: req.query,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'Invalid location coordinates. Please enable location access.' });
    }
    
    const requests = await BloodRequest.findNearbyRequests(
      parseFloat(longitude),
      parseFloat(latitude),
      parseInt(maxDistance),
      bloodGroup || req.user.bloodGroup
    );

    logUserActivity('nearby_requests_searched', req.user.userId, req.user.phone, {
      searchLocation: [parseFloat(longitude), parseFloat(latitude)],
      maxDistance: parseInt(maxDistance),
      bloodGroup: bloodGroup || req.user.bloodGroup,
      requestsFound: requests.length,
      ...requestInfo
    });

    res.json({ requests, count: requests.length });
  } catch (error) {
    logError(error, {
      context: 'requests.list',
      userId: req.user.userId,
      phone: req.user.phone,
      query: req.query,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ error: 'Failed to list requests', message: error.message });
  }
});

// @route   POST /api/requests
// @desc    Create a new blood request
// @access  Private (Requesters only)
router.post('/', auth, isRequester, createRequestValidation, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      logSecurity('blood_request_creation_validation_failed', {
        userId: req.user.userId,
        phone: req.user.phone,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    
    const { bloodGroup, units, hospitalName, hospitalAddress, longitude, latitude, urgency, requiredBy, description, isAnonymous } = req.body;
    
    const request = new BloodRequest({
      requester: req.user._id,
      bloodGroup,
      units,
      hospitalName,
      hospitalAddress,
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      urgency: urgency || 'MEDIUM',
      requiredBy,
      description,
      isAnonymous: !!isAnonymous
    });
    
    await request.save();

    logUserActivity('blood_request_created', req.user.userId, req.user.phone, {
      requestId: request._id,
      bloodGroup,
      units,
      urgency: urgency || 'MEDIUM',
      hospitalName,
      isAnonymous: !!isAnonymous,
      location: [parseFloat(longitude), parseFloat(latitude)],
      ...requestInfo
    });

    // Send notifications to nearby donors
    let notificationsSent = 0;
    let notificationError = null;
    
    try {
      const nearbyDonors = await User.find({
        role: 'DONOR',
        availability: true,
        fcmToken: { $ne: null },
        location: {
          $near: {
            $geometry: request.location,
            $maxDistance: 20000 // 20km radius
          }
        }
      }).limit(20); // Limit to 20 nearby donors

      const tokens = nearbyDonors.map(d => d.fcmToken).filter(Boolean);
      
      if (tokens.length > 0) {
        const urgencyEmoji = {
          'LOW': '🟢',
          'MEDIUM': '🟡', 
          'HIGH': '🟠',
          'CRITICAL': '🔴'
        };

        const title = `${urgencyEmoji[urgency || 'MEDIUM']} New Blood Request Nearby`;
        const body = `${bloodGroup} blood needed - ${hospitalName}`;
        const data = {
          type: 'blood_request',
          requestId: request._id.toString(),
          bloodType: bloodGroup,
          urgency: urgency || 'MEDIUM'
        };

        await sendMulticastNotification(tokens, title, body, data);
        notificationsSent = tokens.length;
        
        logSystemEvent('notifications_sent', {
          requestId: request._id,
          recipientCount: tokens.length,
          notificationType: 'blood_request_created',
          urgency: urgency || 'MEDIUM'
        });
      }
    } catch (error) {
      notificationError = error.message;
      logError(error, {
        context: 'requests.create_notifications',
        requestId: request._id,
        userId: req.user.userId,
        phone: req.user.phone
      });
    }

    res.status(201).json({ 
      message: 'Blood request created successfully', 
      request,
      notificationsSent: notificationsSent > 0,
      notificationError
    });
  } catch (error) {
    logError(error, {
      context: 'requests.create',
      userId: req.user.userId,
      phone: req.user.phone,
      requestData: req.body,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ error: 'Failed to create request', message: error.message });
  }
});

// @route   POST /api/requests/:id/accept
// @desc    Donor accepts a request
// @access  Private (Donors only)
router.post('/:id/accept', auth, isDonor, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const request = await BloodRequest.findById(req.params.id)
      .populate('requester', 'name fcmToken');
      
    if (!request) {
      logSecurity('blood_request_accept_not_found', {
        userId: req.user.userId,
        phone: req.user.phone,
        requestId: req.params.id,
        ...requestInfo
      });
      
      return res.status(404).json({ error: 'Request not found' });
    }
    
    // Check if donor is already accepted
    if (request.acceptedDonors.some(d => d.donor.toString() === req.user._id.toString())) {
      logSecurity('blood_request_already_accepted', {
        userId: req.user.userId,
        phone: req.user.phone,
        requestId: request._id,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'You have already accepted this request' });
    }
    
    // Accept donor
    await request.acceptDonor(req.user._id);

    logUserActivity('blood_request_accepted', req.user.userId, req.user.phone, {
      requestId: request._id,
      requesterId: request.requester._id,
      requesterName: request.requester.name,
      bloodGroup: request.bloodGroup,
      urgency: request.urgency,
      ...requestInfo
    });

    // Send notification to requester
    let notificationSent = false;
    let notificationError = null;
    
    try {
      if (request.requester.fcmToken) {
        const title = '✅ Blood Request Accepted';
        const body = `${req.user.name} has accepted your blood request`;
        const data = {
          type: 'request_accepted',
          requestId: request._id.toString(),
          donorId: req.user._id.toString(),
          donorName: req.user.name,
          donorPhone: req.user.phone
        };

        await sendNotification(request.requester.fcmToken, title, body, data);
        notificationSent = true;
        
        logSystemEvent('acceptance_notification_sent', {
          requestId: request._id,
          donorId: req.user._id,
          requesterId: request.requester._id,
          notificationType: 'request_accepted'
        });
      }
    } catch (error) {
      notificationError = error.message;
      logError(error, {
        context: 'requests.accept_notification',
        requestId: request._id,
        donorId: req.user._id,
        requesterId: request.requester._id
      });
    }

    res.json({ 
      message: 'Request accepted successfully', 
      request,
      notificationSent,
      notificationError
    });
  } catch (error) {
    logError(error, {
      context: 'requests.accept',
      userId: req.user.userId,
      phone: req.user.phone,
      requestId: req.params.id,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ error: 'Failed to accept request', message: error.message });
  }
});

// Chat: Send a message
router.post('/chats/:requestId/message', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const chatMsg = new ChatMessage({
      requestId: req.params.requestId,
      sender: req.user._id,
      message: message.trim(),
    });
    await chatMsg.save();
    // Find the blood request to determine recipient
    const bloodRequest = await BloodRequest.findById(req.params.requestId).lean();
    if (bloodRequest) {
      let recipientId = null;
      if (req.user._id.toString() === bloodRequest.requester.toString()) {
        // Sender is requester, recipient is donor (first accepted donor for now)
        if (bloodRequest.acceptedDonors && bloodRequest.acceptedDonors.length > 0) {
          recipientId = bloodRequest.acceptedDonors[0].donor;
        }
      } else {
        // Sender is donor, recipient is requester
        recipientId = bloodRequest.requester;
      }
      if (recipientId) {
        const recipient = await User.findById(recipientId);
        if (recipient) {
          await sendChatMessageNotification(recipient, req.user.name, message.trim(), req.params.requestId);
        }
      }
    }
    res.status(201).json(chatMsg);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message', message: error.message });
  }
});

// Chat: Get chat history
router.get('/chats/:requestId', auth, async (req, res) => {
  try {
    const messages = await ChatMessage.find({ requestId: req.params.requestId })
      .sort({ timestamp: 1 })
      .populate('sender', 'name role');
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chat history', message: error.message });
  }
});

module.exports = router; 