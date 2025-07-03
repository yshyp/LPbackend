const express = require('express');
const User = require('../models/User');
const BloodRequest = require('../models/BloodRequest');
const { auth, isRequester, isDonor } = require('../middleware/auth');
const { 
  sendNotification, 
  sendMulticastNotification, 
  sendTopicNotification,
  subscribeToTopic,
  unsubscribeFromTopic 
} = require('../config/firebase');
const { logUserActivity, logError, logSecurity, logSystemEvent } = require('../services/loggerService');

const router = express.Router();

// Helper function to get request info
const getRequestInfo = (req) => ({
  ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
  userAgent: req.get('User-Agent'),
  method: req.method,
  path: req.path
});

// @route   POST /api/notifications/push
// @desc    Send push notification to matched donors
// @access  Private (Requesters only)
router.post('/push', auth, isRequester, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const { donorIds, title, body, data } = req.body;
    
    if (!donorIds || !Array.isArray(donorIds) || donorIds.length === 0) {
      logSecurity('push_notification_invalid_donor_ids', {
        userId: req.user.userId,
        phone: req.user.phone,
        donorIds,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'donorIds array is required' });
    }
    
    if (!title || !body) {
      logSecurity('push_notification_missing_content', {
        userId: req.user.userId,
        phone: req.user.phone,
        title,
        body,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'title and body are required' });
    }

    // Find donors with FCM tokens
    const donors = await User.find({ 
      _id: { $in: donorIds }, 
      fcmToken: { $ne: null },
      isAvailable: true 
    });
    
    const tokens = donors.map(d => d.fcmToken).filter(Boolean);
    
    if (tokens.length === 0) {
      logSecurity('push_notification_no_valid_tokens', {
        userId: req.user.userId,
        phone: req.user.phone,
        donorIds,
        donorsFound: donors.length,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'No valid FCM tokens found for available donors' });
    }

    // Send multicast notification
    const response = await sendMulticastNotification(tokens, title, body, data);
    
    logUserActivity('push_notification_sent', req.user.userId, req.user.phone, {
      donorIds,
      recipientCount: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      title,
      notificationType: data?.type || 'custom',
      ...requestInfo
    });

    res.json({ 
      message: 'Notifications sent successfully',
      successCount: response.successCount, 
      failureCount: response.failureCount,
      totalTokens: tokens.length
    });
  } catch (error) {
    logError(error, {
      context: 'notifications.push',
      userId: req.user.userId,
      phone: req.user.phone,
      donorIds: req.body.donorIds,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ error: 'Failed to send notifications', message: error.message });
  }
});

// @route   POST /api/notifications/request-created
// @desc    Send notification to nearby donors when a blood request is created
// @access  Private (System)
router.post('/request-created', auth, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const { requestId } = req.body;
    
    if (!requestId) {
      logSecurity('request_created_notification_missing_id', {
        userId: req.user.userId,
        phone: req.user.phone,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'requestId is required' });
    }

    const bloodRequest = await BloodRequest.findById(requestId)
      .populate('requester', 'name phone')
      .populate('acceptedDonors', 'name fcmToken');
    
    if (!bloodRequest) {
      logSecurity('request_created_notification_request_not_found', {
        userId: req.user.userId,
        phone: req.user.phone,
        requestId,
        ...requestInfo
      });
      
      return res.status(404).json({ error: 'Blood request not found' });
    }

    // Find nearby available donors
    const nearbyDonors = await User.find({
      role: 'donor',
      isAvailable: true,
      fcmToken: { $ne: null },
      location: {
        $near: {
          $geometry: bloodRequest.location,
          $maxDistance: 20000 // 20km radius
        }
      }
    }).limit(20); // Limit to 20 nearby donors

    const tokens = nearbyDonors.map(d => d.fcmToken).filter(Boolean);
    
    if (tokens.length === 0) {
      logSystemEvent('request_created_no_nearby_donors', {
        requestId,
        requesterId: bloodRequest.requester._id,
        searchRadius: 20000,
        ...requestInfo
      });
      
      return res.json({ message: 'No nearby donors found', successCount: 0 });
    }

    const title = '🩸 New Blood Request Nearby';
    const body = `${bloodRequest.bloodType} blood needed - ${bloodRequest.hospitalName}`;
    const data = {
      type: 'blood_request',
      requestId: requestId,
      bloodType: bloodRequest.bloodType,
      urgency: bloodRequest.urgency
    };

    const response = await sendMulticastNotification(tokens, title, body, data);
    
    logSystemEvent('request_created_notifications_sent', {
      requestId,
      requesterId: bloodRequest.requester._id,
      recipientCount: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      urgency: bloodRequest.urgency,
      ...requestInfo
    });
    
    res.json({ 
      message: 'Blood request notifications sent',
      successCount: response.successCount, 
      failureCount: response.failureCount,
      totalDonors: tokens.length
    });
  } catch (error) {
    logError(error, {
      context: 'notifications.request_created',
      userId: req.user.userId,
      phone: req.user.phone,
      requestId: req.body.requestId,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ error: 'Failed to send notifications', message: error.message });
  }
});

// @route   POST /api/notifications/request-accepted
// @desc    Send notification to requester when a donor accepts their request
// @access  Private (System)
router.post('/request-accepted', auth, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const { requestId, donorId } = req.body;
    
    if (!requestId || !donorId) {
      logSecurity('request_accepted_notification_missing_data', {
        userId: req.user.userId,
        phone: req.user.phone,
        requestId,
        donorId,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'requestId and donorId are required' });
    }

    const bloodRequest = await BloodRequest.findById(requestId)
      .populate('requester', 'name fcmToken')
      .populate('acceptedDonors', 'name phone');
    
    if (!bloodRequest) {
      logSecurity('request_accepted_notification_request_not_found', {
        userId: req.user.userId,
        phone: req.user.phone,
        requestId,
        ...requestInfo
      });
      
      return res.status(404).json({ error: 'Blood request not found' });
    }

    const donor = await User.findById(donorId);
    if (!donor) {
      logSecurity('request_accepted_notification_donor_not_found', {
        userId: req.user.userId,
        phone: req.user.phone,
        donorId,
        ...requestInfo
      });
      
      return res.status(404).json({ error: 'Donor not found' });
    }

    let notificationSent = false;
    let notificationError = null;

    // Send notification to requester
    if (bloodRequest.requester.fcmToken) {
      try {
        const title = '✅ Blood Request Accepted';
        const body = `${donor.name} has accepted your blood request`;
        const data = {
          type: 'request_accepted',
          requestId: requestId,
          donorId: donorId,
          donorName: donor.name,
          donorPhone: donor.phone
        };

        await sendNotification(bloodRequest.requester.fcmToken, title, body, data);
        notificationSent = true;
        
        logSystemEvent('request_accepted_notification_sent', {
          requestId,
          donorId,
          requesterId: bloodRequest.requester._id,
          notificationType: 'request_accepted',
          ...requestInfo
        });
      } catch (error) {
        notificationError = error.message;
        logError(error, {
          context: 'notifications.request_accepted_send',
          requestId,
          donorId,
          requesterId: bloodRequest.requester._id
        });
      }
    } else {
      logSystemEvent('request_accepted_no_requester_token', {
        requestId,
        donorId,
        requesterId: bloodRequest.requester._id,
        ...requestInfo
      });
    }

    res.json({ 
      message: 'Acceptance notification sent to requester',
      notificationSent,
      notificationError
    });
  } catch (error) {
    logError(error, {
      context: 'notifications.request_accepted',
      userId: req.user.userId,
      phone: req.user.phone,
      requestId: req.body.requestId,
      donorId: req.body.donorId,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ error: 'Failed to send notification', message: error.message });
  }
});

// @route   POST /api/notifications/subscribe-topic
// @desc    Subscribe user to a notification topic
// @access  Private
router.post('/subscribe-topic', auth, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const { topic } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user.fcmToken) {
      logSecurity('subscribe_topic_no_fcm_token', {
        userId: req.user.userId,
        phone: req.user.phone,
        topic,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'User has no FCM token registered' });
    }

    if (!topic) {
      logSecurity('subscribe_topic_missing_topic', {
        userId: req.user.userId,
        phone: req.user.phone,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'topic is required' });
    }

    const response = await subscribeToTopic([user.fcmToken], topic);
    
    logUserActivity('topic_subscribed', req.user.userId, req.user.phone, {
      topic,
      successCount: response.successCount,
      failureCount: response.failureCount,
      ...requestInfo
    });
    
    res.json({ 
      message: 'Successfully subscribed to topic',
      topic: topic,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (error) {
    logError(error, {
      context: 'notifications.subscribe_topic',
      userId: req.user.userId,
      phone: req.user.phone,
      topic: req.body.topic,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ error: 'Failed to subscribe to topic', message: error.message });
  }
});

// @route   POST /api/notifications/unsubscribe-topic
// @desc    Unsubscribe user from a notification topic
// @access  Private
router.post('/unsubscribe-topic', auth, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const { topic } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user.fcmToken) {
      logSecurity('unsubscribe_topic_no_fcm_token', {
        userId: req.user.userId,
        phone: req.user.phone,
        topic,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'User has no FCM token registered' });
    }

    if (!topic) {
      logSecurity('unsubscribe_topic_missing_topic', {
        userId: req.user.userId,
        phone: req.user.phone,
        ...requestInfo
      });
      
      return res.status(400).json({ error: 'topic is required' });
    }

    const response = await unsubscribeFromTopic([user.fcmToken], topic);
    
    logUserActivity('topic_unsubscribed', req.user.userId, req.user.phone, {
      topic,
      successCount: response.successCount,
      failureCount: response.failureCount,
      ...requestInfo
    });
    
    res.json({ 
      message: 'Successfully unsubscribed from topic',
      topic: topic,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (error) {
    logError(error, {
      context: 'notifications.unsubscribe_topic',
      userId: req.user.userId,
      phone: req.user.phone,
      topic: req.body.topic,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ error: 'Failed to unsubscribe from topic', message: error.message });
  }
});

module.exports = router; 