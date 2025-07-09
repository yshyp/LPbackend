const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth, isDonorOrRequester } = require('../middleware/auth');
const { logUserActivity, logError, logSecurity } = require('../services/loggerService');

const router = express.Router();

// Helper function to get request info
const getRequestInfo = (req) => ({
  ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
  userAgent: req.get('User-Agent'),
  method: req.method,
  path: req.path
});

// Validation rules
const updateLocationValidation = [
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude')
];

const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('emergencyContact.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Emergency contact name must be between 2 and 50 characters'),
  body('emergencyContact.phone')
    .optional()
    .trim()
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please enter a valid emergency contact phone number'),
  body('emergencyContact.relationship')
    .optional()
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('Relationship must be between 2 and 30 characters')
];

// @route   POST /api/users/fcm-token
// @desc    Register FCM token for push notifications
// @access  Private
router.post('/fcm-token', auth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    
    console.log('📱 FCM Token registration request:', {
      userId: req.user?._id,
      userPhone: req.user?.phone,
      userEmail: req.user?.email,
      tokenExists: !!fcmToken,
      tokenLength: fcmToken?.length,
      reqUserType: typeof req.user,
      isUserObject: req.user ? true : false
    });
    
    if (!fcmToken) {
      return res.status(400).json({ error: 'FCM token is required' });
    }

    // Since req.user is already the full user object from auth middleware,
    // we can update it directly
    if (!req.user) {
      console.error('❌ No user found in req.user');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('🔍 User found in req.user:', {
      id: req.user._id,
      email: req.user.email,
      phone: req.user.phone,
      name: req.user.name
    });

    // Update FCM token directly on the user object
    req.user.fcmToken = fcmToken;
    await req.user.save();

    console.log('✅ FCM token updated successfully for user:', req.user.phone || req.user.email);
    
    res.json({
      message: 'FCM token registered successfully',
      success: true,
      userId: req.user._id
    });

  } catch (error) {
    console.error('❌ FCM token registration error:', error);
    res.status(500).json({ error: 'Failed to register FCM token' });
  }
});

// @route   PUT /api/users/me/location
// @desc    Update user location and FCM token
// @access  Private
router.put('/me/location', auth, updateLocationValidation, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('location_update_validation_failed', {
        userId: req.user.userId,
        phone: req.user.phone,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { longitude, latitude, fcmToken } = req.body;
    const oldLocation = req.user.location.coordinates;

    // Update location
    req.user.location = {
      type: "Point",
      coordinates: [parseFloat(longitude), parseFloat(latitude)]
    };

    // Update FCM token if provided
    let fcmTokenUpdated = false;
    if (fcmToken && fcmToken !== req.user.fcmToken) {
      req.user.fcmToken = fcmToken;
      fcmTokenUpdated = true;
    }

    await req.user.save();

    logUserActivity('location_updated', req.user.userId, req.user.phone, {
      oldLocation,
      newLocation: req.user.location.coordinates,
      fcmTokenUpdated,
      ...requestInfo
    });

    res.json({
      message: 'Location updated successfully',
      location: req.user.location,
      fcmToken: req.user.fcmToken
    });

  } catch (error) {
    logError(error, {
      context: 'users.location_update',
      userId: req.user.userId,
      phone: req.user.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to update location',
      message: error.message 
    });
  }
});

// @route   PUT /api/users/me/availability
// @desc    Toggle donor availability
// @access  Private (Donors only)
router.put('/me/availability', auth, isDonorOrRequester, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    if (req.user.role !== 'DONOR') {
      logSecurity('availability_toggle_unauthorized', {
        userId: req.user.userId,
        phone: req.user.phone,
        role: req.user.role,
        ...requestInfo
      });
      
      return res.status(403).json({ 
        error: 'Only donors can toggle availability' 
      });
    }

    const oldAvailability = req.user.availability;
    await req.user.toggleAvailability();

    logUserActivity('availability_toggled', req.user.userId, req.user.phone, {
      oldAvailability,
      newAvailability: req.user.availability,
      role: req.user.role,
      ...requestInfo
    });

    res.json({
      message: `Availability ${req.user.availability ? 'enabled' : 'disabled'} successfully`,
      availability: req.user.availability
    });

  } catch (error) {
    logError(error, {
      context: 'users.availability_toggle',
      userId: req.user.userId,
      phone: req.user.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to toggle availability',
      message: error.message 
    });
  }
});

// @route   PUT /api/users/me/profile
// @desc    Update user profile
// @access  Private
router.put('/me/profile', auth, updateProfileValidation, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('profile_update_validation_failed', {
        userId: req.user.userId,
        phone: req.user.phone,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { name, emergencyContact, medicalHistory } = req.body;
    const oldProfile = {
      name: req.user.name,
      emergencyContact: req.user.emergencyContact,
      medicalHistory: req.user.medicalHistory
    };

    // Update allowed fields
    if (name) {
      req.user.name = name;
    }

    if (emergencyContact) {
      req.user.emergencyContact = {
        ...req.user.emergencyContact,
        ...emergencyContact
      };
    }

    if (medicalHistory) {
      req.user.medicalHistory = {
        ...req.user.medicalHistory,
        ...medicalHistory
      };
    }

    await req.user.save();

    logUserActivity('profile_updated', req.user.userId, req.user.phone, {
      oldProfile,
      newProfile: {
        name: req.user.name,
        emergencyContact: req.user.emergencyContact,
        medicalHistory: req.user.medicalHistory
      },
      ...requestInfo
    });

    // Return updated user (excluding sensitive info)
    const userResponse = {
      _id: req.user._id,
      name: req.user.name,
      phone: req.user.phone,
      role: req.user.role,
      bloodGroup: req.user.bloodGroup,
      location: req.user.location,
      availability: req.user.availability,
      isVerified: req.user.isVerified,
      emergencyContact: req.user.emergencyContact,
      medicalHistory: req.user.medicalHistory,
      lastDonatedAt: req.user.lastDonatedAt,
      createdAt: req.user.createdAt
    };

    res.json({
      message: 'Profile updated successfully',
      user: userResponse
    });

  } catch (error) {
    logError(error, {
      context: 'users.profile_update',
      userId: req.user.userId,
      phone: req.user.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to update profile',
      message: error.message 
    });
  }
});

// @route   GET /api/users/me/donations
// @desc    Get user's donation history
// @access  Private
router.get('/me/donations', auth, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const BloodRequest = require('../models/BloodRequest');
    
    let donations;
    
    if (req.user.role === 'DONOR') {
      // Get requests where user is an accepted donor
      donations = await BloodRequest.findByDonor(req.user._id);
    } else {
      // Get requests created by requester
      donations = await BloodRequest.findByRequester(req.user._id);
    }

    logUserActivity('donations_history_accessed', req.user.userId, req.user.phone, {
      role: req.user.role,
      donationCount: donations.length,
      totalDonations: req.user.medicalHistory.totalDonations,
      ...requestInfo
    });

    res.json({
      donations,
      totalDonations: req.user.medicalHistory.totalDonations,
      lastDonatedAt: req.user.lastDonatedAt
    });

  } catch (error) {
    logError(error, {
      context: 'users.get_donations',
      userId: req.user.userId,
      phone: req.user.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to get donation history',
      message: error.message 
    });
  }
});

// @route   POST /api/users/me/record-donation
// @desc    Record a blood donation
// @access  Private (Donors only)
router.post('/me/record-donation', auth, isDonorOrRequester, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    if (req.user.role !== 'DONOR') {
      logSecurity('record_donation_unauthorized', {
        userId: req.user.userId,
        phone: req.user.phone,
        role: req.user.role,
        ...requestInfo
      });
      
      return res.status(403).json({ 
        error: 'Only donors can record donations' 
      });
    }

    const oldTotalDonations = req.user.medicalHistory.totalDonations;
    const oldLastDonatedAt = req.user.lastDonatedAt;

    await req.user.recordDonation();

    logUserActivity('donation_recorded', req.user.userId, req.user.phone, {
      oldTotalDonations,
      newTotalDonations: req.user.medicalHistory.totalDonations,
      oldLastDonatedAt,
      newLastDonatedAt: req.user.lastDonatedAt,
      ...requestInfo
    });

    res.json({
      message: 'Donation recorded successfully',
      lastDonatedAt: req.user.lastDonatedAt,
      totalDonations: req.user.medicalHistory.totalDonations
    });

  } catch (error) {
    logError(error, {
      context: 'users.record_donation',
      userId: req.user.userId,
      phone: req.user.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to record donation',
      message: error.message 
    });
  }
});

// @route   GET /api/users/nearby-donors
// @desc    Find nearby available donors
// @access  Private
router.get('/nearby-donors', auth, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const { longitude, latitude, maxDistance = 20000, bloodGroup } = req.query;

    if (!longitude || !latitude) {
      logSecurity('nearby_donors_missing_coordinates', {
        userId: req.user.userId,
        phone: req.user.phone,
        query: req.query,
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Longitude and latitude are required' 
      });
    }

    // Validate coordinates are not 0,0 (invalid location)
    if (parseFloat(longitude) === 0 && parseFloat(latitude) === 0) {
      logSecurity('nearby_donors_invalid_coordinates', {
        userId: req.user.userId,
        phone: req.user.phone,
        query: req.query,
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Invalid location coordinates. Please enable location access.' 
      });
    }

    const donors = await User.findNearbyDonors(
      parseFloat(longitude),
      parseFloat(latitude),
      parseInt(maxDistance),
      bloodGroup
    );

    logUserActivity('nearby_donors_searched', req.user.userId, req.user.phone, {
      searchLocation: [parseFloat(longitude), parseFloat(latitude)],
      maxDistance: parseInt(maxDistance),
      bloodGroup,
      donorsFound: donors.length,
      ...requestInfo
    });

    res.json({
      donors,
      count: donors.length,
      searchRadius: maxDistance
    });

  } catch (error) {
    logError(error, {
      context: 'users.nearby_donors',
      userId: req.user.userId,
      phone: req.user.phone,
      query: req.query,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to find nearby donors',
      message: error.message 
    });
  }
});

// @route   GET /api/users/nearby-requesters
// @desc    Find nearby requesters
// @access  Private
router.get('/nearby-requesters', auth, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    const { longitude, latitude, maxDistance = 20000 } = req.query;

    if (!longitude || !latitude) {
      logSecurity('nearby_requesters_missing_coordinates', {
        userId: req.user.userId,
        phone: req.user.phone,
        query: req.query,
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Longitude and latitude are required' 
      });
    }

    // Validate coordinates are not 0,0 (invalid location)
    if (parseFloat(longitude) === 0 && parseFloat(latitude) === 0) {
      logSecurity('nearby_requesters_invalid_coordinates', {
        userId: req.user.userId,
        phone: req.user.phone,
        query: req.query,
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Invalid location coordinates. Please enable location access.' 
      });
    }

    const requesters = await User.findNearbyRequesters(
      parseFloat(longitude),
      parseFloat(latitude),
      parseInt(maxDistance)
    );

    logUserActivity('nearby_requesters_searched', req.user.userId, req.user.phone, {
      searchLocation: [parseFloat(longitude), parseFloat(latitude)],
      maxDistance: parseInt(maxDistance),
      requestersFound: requesters.length,
      ...requestInfo
    });

    res.json({
      requesters,
      count: requesters.length,
      searchRadius: maxDistance
    });

  } catch (error) {
    logError(error, {
      context: 'users.nearby_requesters',
      userId: req.user.userId,
      phone: req.user.phone,
      query: req.query,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to find nearby requesters',
      message: error.message 
    });
  }
});

// @route   DELETE /api/users/me
// @desc    Delete user account
// @access  Private
router.delete('/me', auth, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check if user has active requests
    const BloodRequest = require('../models/BloodRequest');
    
    if (req.user.role === 'REQUESTER') {
      const activeRequests = await BloodRequest.find({
        requester: req.user._id,
        status: { $in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS'] }
      });

      if (activeRequests.length > 0) {
        logSecurity('account_deletion_blocked_active_requests', {
          userId: req.user.userId,
          phone: req.user.phone,
          role: req.user.role,
          activeRequestsCount: activeRequests.length,
          ...requestInfo
        });
        
        return res.status(400).json({ 
          error: 'Cannot delete account with active blood requests' 
        });
      }
    }

    // Log user data before deletion for audit purposes
    const userData = {
      userId: req.user._id,
      phone: req.user.phone,
      role: req.user.role,
      bloodGroup: req.user.bloodGroup,
      totalDonations: req.user.medicalHistory.totalDonations,
      createdAt: req.user.createdAt
    };

    // Delete user
    await User.findByIdAndDelete(req.user._id);

    logUserActivity('account_deleted', req.user.userId, req.user.phone, {
      userData,
      ...requestInfo
    });

    res.json({ 
      message: 'Account deleted successfully' 
    });

  } catch (error) {
    logError(error, {
      context: 'users.delete_account',
      userId: req.user.userId,
      phone: req.user.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to delete account',
      message: error.message 
    });
  }
});

// @route   GET /api/users/:id/eligibility
// @desc    Check if user is eligible to donate (90 days rule)
// @access  Public or Private (depending on use case)
router.get('/:id/eligibility', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const eligibility = user.isEligibleToDonate();
    res.json(eligibility);
  } catch (error) {
    logError(error, {
      context: 'users.eligibility_check',
      userId: req.params.id
    });
    res.status(500).json({ error: 'Failed to check eligibility', message: error.message });
  }
});

// @route   GET /api/users/leaderboard
// @desc    Get leaderboard of top donors
// @access  Public
router.get('/leaderboard', async (req, res) => {
  try {
    // Top 10 donors by totalDonations
    const topDonors = await User.find({ 'role': 'DONOR' })
      .sort({ 'medicalHistory.totalDonations': -1 })
      .limit(10)
      .select('name bloodGroup medicalHistory.totalDonations');
    res.json(topDonors.map(user => ({
      name: user.name,
      bloodGroup: user.bloodGroup,
      totalDonations: user.medicalHistory?.totalDonations || 0
    })));
  } catch (error) {
    logError(error, { context: 'users.leaderboard' });
    res.status(500).json({ error: 'Failed to fetch leaderboard', message: error.message });
  }
});

// Add this temporary debug route
router.get('/debug-auth', auth, async (req, res) => {
  try {
    console.log('🔍 Debug auth - req.user:', req.user);
    
    const user = await User.findById(req.user.userId);
    console.log('🔍 Debug auth - user found:', !!user);
    console.log('🔍 Debug auth - user details:', user ? {
      id: user._id,
      phone: user.phone,
      email: user.email,
      name: user.name
    } : 'N/A');
    
    res.json({
      authUser: req.user,
      dbUser: user ? {
        id: user._id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        fcmToken: user.fcmToken
      } : null
    });
  } catch (error) {
    console.error('❌ Debug auth error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// Add this to your frontend app temporarily (you can put it in a button or call it from console)
const testDebugAuth = async () => {
  try {
    const response = await apiService.get('/api/users/debug-auth');
    console.log('🔍 Debug auth response:', response.data);
  } catch (error) {
    console.error('❌ Debug auth failed:', error.response?.data);
  }
};

// Call this function after login
testDebugAuth();