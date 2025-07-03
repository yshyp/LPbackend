const express = require('express');
const { body, validationResult } = require('express-validator');
const BloodCamp = require('../models/BloodCamp');
const { auth, isAdmin } = require('../middleware/auth');
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
const createCampValidation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Camp name must be between 3 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  body('location.coordinates')
    .isArray({ min: 2, max: 2 })
    .withMessage('Location coordinates must be an array of 2 numbers'),
  body('location.coordinates.*')
    .isFloat()
    .withMessage('Coordinates must be numbers'),
  body('location.address')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  body('location.city')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('City must be between 2 and 50 characters'),
  body('date')
    .isISO8601()
    .withMessage('Date must be a valid date'),
  body('startTime')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Start time is required'),
  body('endTime')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('End time is required'),
  body('organizer.name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Organizer name must be between 2 and 50 characters'),
  body('organizer.phone')
    .trim()
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please enter a valid phone number'),
  body('organizer.email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address'),
  body('capacity')
    .isInt({ min: 1 })
    .withMessage('Capacity must be at least 1'),
  body('bloodGroups')
    .isArray({ min: 1 })
    .withMessage('At least one blood group is required'),
  body('bloodGroups.*')
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .withMessage('Invalid blood group')
];

// @route   GET /api/blood-camps
// @desc    Get blood camps (with optional location filtering)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { longitude, latitude, maxDistance = 20000, limit = 20 } = req.query;
    
    let camps;
    
    if (longitude && latitude) {
      // Find nearby camps
      camps = await BloodCamp.findNearbyCamps(
        parseFloat(longitude),
        parseFloat(latitude),
        parseInt(maxDistance)
      );
    } else {
      // Find upcoming camps
      camps = await BloodCamp.findUpcomingCamps(parseInt(limit));
    }
    
    res.json({
      camps,
      count: camps.length
    });
  } catch (error) {
    logError(error, {
      context: 'bloodCamps.list',
      query: req.query
    });
    res.status(500).json({ error: 'Failed to fetch blood camps', message: error.message });
  }
});

// @route   GET /api/blood-camps/:id
// @desc    Get blood camp details
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const camp = await BloodCamp.findById(req.params.id);
    
    if (!camp) {
      return res.status(404).json({ error: 'Blood camp not found' });
    }
    
    res.json(camp);
  } catch (error) {
    logError(error, {
      context: 'bloodCamps.get',
      campId: req.params.id
    });
    res.status(500).json({ error: 'Failed to fetch blood camp', message: error.message });
  }
});

// @route   POST /api/blood-camps
// @desc    Create a new blood camp
// @access  Private (Admin only)
router.post('/', auth, isAdmin, createCampValidation, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('blood_camp_creation_validation_failed', {
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

    const campData = req.body;
    
    // Ensure location has the correct structure
    campData.location = {
      type: 'Point',
      coordinates: campData.location.coordinates,
      address: campData.location.address,
      city: campData.location.city
    };
    
    const camp = new BloodCamp(campData);
    await camp.save();
    
    logUserActivity('blood_camp_created', req.user.userId, req.user.phone, {
      campId: camp._id,
      campName: camp.name,
      ...requestInfo
    });
    
    res.status(201).json({
      message: 'Blood camp created successfully',
      camp
    });
  } catch (error) {
    logError(error, {
      context: 'bloodCamps.create',
      userId: req.user.userId,
      phone: req.user.phone
    });
    res.status(500).json({ error: 'Failed to create blood camp', message: error.message });
  }
});

// @route   PUT /api/blood-camps/:id
// @desc    Update blood camp
// @access  Private (Admin only)
router.put('/:id', auth, isAdmin, createCampValidation, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('blood_camp_update_validation_failed', {
        userId: req.user.userId,
        phone: req.user.phone,
        campId: req.params.id,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const camp = await BloodCamp.findById(req.params.id);
    
    if (!camp) {
      return res.status(404).json({ error: 'Blood camp not found' });
    }
    
    const updateData = req.body;
    
    // Ensure location has the correct structure
    if (updateData.location) {
      updateData.location = {
        type: 'Point',
        coordinates: updateData.location.coordinates,
        address: updateData.location.address,
        city: updateData.location.city
      };
    }
    
    Object.assign(camp, updateData);
    await camp.save();
    
    logUserActivity('blood_camp_updated', req.user.userId, req.user.phone, {
      campId: camp._id,
      campName: camp.name,
      ...requestInfo
    });
    
    res.json({
      message: 'Blood camp updated successfully',
      camp
    });
  } catch (error) {
    logError(error, {
      context: 'bloodCamps.update',
      userId: req.user.userId,
      phone: req.user.phone,
      campId: req.params.id
    });
    res.status(500).json({ error: 'Failed to update blood camp', message: error.message });
  }
});

// @route   DELETE /api/blood-camps/:id
// @desc    Delete blood camp
// @access  Private (Admin only)
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    const camp = await BloodCamp.findById(req.params.id);
    
    if (!camp) {
      return res.status(404).json({ error: 'Blood camp not found' });
    }
    
    await BloodCamp.findByIdAndDelete(req.params.id);
    
    logUserActivity('blood_camp_deleted', req.user.userId, req.user.phone, {
      campId: camp._id,
      campName: camp.name,
      ...requestInfo
    });
    
    res.json({ message: 'Blood camp deleted successfully' });
  } catch (error) {
    logError(error, {
      context: 'bloodCamps.delete',
      userId: req.user.userId,
      phone: req.user.phone,
      campId: req.params.id
    });
    res.status(500).json({ error: 'Failed to delete blood camp', message: error.message });
  }
});

module.exports = router; 