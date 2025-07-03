const express = require('express');
const { body, param } = require('express-validator');
const rateLimit = require('express-rate-limit');
const verificationService = require('../services/verificationService');
const User = require('../models/User');
const { logUserActivity, logError, logSystemEvent } = require('../services/loggerService');

const router = express.Router();

// Rate limiting for verification endpoints
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many verification requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSystemEvent('verification_rate_limit_exceeded', {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    res.status(429).json({
      error: 'Too many verification requests, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Rate limiting for code verification
const codeVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many verification attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSystemEvent('code_verification_rate_limit_exceeded', {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    res.status(429).json({
      error: 'Too many verification attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// @desc    Send verification code (SMS or Email)
// @route   POST /api/verification/send
// @access  Public
router.post('/send',
  verificationLimiter,
  [
    body('identifier')
      .notEmpty()
      .withMessage('Phone number or email is required')
      .custom((value) => {
        // Check if it's a valid email or phone number
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
        
        if (!emailRegex.test(value) && !phoneRegex.test(value)) {
          throw new Error('Please provide a valid phone number or email address');
        }
        return true;
      }),
    body('type')
      .isIn(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET'])
      .withMessage('Invalid verification type'),
    body('method')
      .optional()
      .isIn(['SMS', 'EMAIL', 'AUTO'])
      .withMessage('Method must be SMS, EMAIL, or AUTO'),
    body('userName')
      .optional()
      .isString()
      .withMessage('User name must be a string')
  ],
  async (req, res) => {
    // Debug log for request body
    console.log('DEBUG /api/verification/send BODY:', req.body);
    try {
      const { identifier, type, method = 'AUTO', userName = 'User' } = req.body;
      const requestInfo = verificationService.getRequestContext(req);

      // Determine verification method
      let verificationMethod = method;
      if (method === 'AUTO') {
        // Auto-detect based on identifier
        verificationMethod = identifier.includes('@') ? 'EMAIL' : 'SMS';
      }

      // Validate method compatibility with identifier
      if (verificationMethod === 'EMAIL' && !identifier.includes('@')) {
        return res.status(400).json({
          error: 'Email verification requires a valid email address'
        });
      }

      if (verificationMethod === 'SMS' && identifier.includes('@')) {
        return res.status(400).json({
          error: 'SMS verification requires a valid phone number'
        });
      }

      logUserActivity('verification_requested', null, identifier.replace(/\w(?=\w{2})/g, '*'), {
        type,
        method: verificationMethod,
        userChoice: method,
        ...requestInfo
      });

      // Check if user exists for LOGIN and PASSWORD_RESET
      if (type === 'LOGIN' || type === 'PASSWORD_RESET') {
        const user = await User.findOne({
          $or: [
            { phone: identifier },
            { email: identifier }
          ]
        });

        if (!user) {
          logSystemEvent('verification_user_not_found', {
            identifier: identifier.replace(/\w(?=\w{2})/g, '*'),
            type,
            method: verificationMethod,
            ...requestInfo
          });
          return res.status(404).json({
            error: 'User not found with this phone number or email'
          });
        }

        // For PASSWORD_RESET, check if email is verified
        if (type === 'PASSWORD_RESET' && verificationMethod === 'EMAIL' && !user.emailVerified) {
          return res.status(400).json({
            error: 'Email must be verified before password reset'
          });
        }
      }

      // Check if user already exists for EMAIL_VERIFICATION
      if (type === 'EMAIL_VERIFICATION') {
        const existingUser = await User.findOne({
          $or: [
            { phone: identifier },
            { email: identifier }
          ]
        });

        if (existingUser) {
          logSystemEvent('verification_user_already_exists', {
            identifier: identifier.replace(/\w(?=\w{2})/g, '*'),
            type,
            method: verificationMethod,
            ...requestInfo
          });
          return res.status(400).json({
            error: 'User already exists with this phone number or email'
          });
        }
      }

      // Temporarily set the verification method for this request
      const originalMethod = verificationService.getVerificationMethod();
      verificationService.setVerificationMethod(verificationMethod);

      // Send verification code
      const result = await verificationService.sendVerificationCode(
        identifier,
        type,
        userName,
        requestInfo
      );

      // Restore original method
      verificationService.setVerificationMethod(originalMethod);

      if (!result.success) {
        return res.status(500).json({
          error: result.error || 'Failed to send verification code'
        });
      }

      res.status(200).json({
        message: result.message,
        method: verificationMethod,
        userChoice: method,
        expiresAt: result.expiresAt
      });

    } catch (error) {
      logError(error, {
        context: 'verification.send',
        identifier: req.body.identifier?.replace(/\w(?=\w{2})/g, '*'),
        type: req.body.type,
        method: req.body.method
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// @desc    Verify code
// @route   POST /api/verification/verify
// @access  Public
router.post('/verify',
  codeVerificationLimiter,
  [
    body('identifier')
      .notEmpty()
      .withMessage('Phone number or email is required'),
    body('code')
      .isLength({ min: 6, max: 6 })
      .withMessage('Verification code must be 6 digits'),
    body('type')
      .isIn(['LOGIN', 'EMAIL_VERIFICATION', 'PASSWORD_RESET'])
      .withMessage('Invalid verification type')
  ],
  async (req, res) => {
    try {
      const { identifier, code, type } = req.body;
      const requestInfo = verificationService.getRequestContext(req);

      logUserActivity('verification_attempt', null, identifier.replace(/\w(?=\w{2})/g, '*'), {
        type,
        method: verificationService.getVerificationMethod(),
        code: code.substring(0, 2) + '****',
        ...requestInfo
      });

      // Verify the code
      const result = await verificationService.verifyCode(
        identifier,
        code,
        type,
        requestInfo
      );

      if (!result.valid) {
        return res.status(400).json({
          error: result.message
        });
      }

      // For LOGIN, return user data and token
      if (type === 'LOGIN') {
        const user = await User.findOne({
          $or: [
            { phone: identifier },
            { email: identifier }
          ]
        }).select('-password');

        if (!user) {
          return res.status(404).json({
            error: 'User not found'
          });
        }

        // Generate JWT token
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
          { userId: user._id },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );

        return res.status(200).json({
          message: 'Login successful',
          user,
          token
        });
      }

      // For EMAIL_VERIFICATION, return success message
      if (type === 'EMAIL_VERIFICATION') {
        return res.status(200).json({
          message: 'Verification successful. You can now complete your registration.',
          verified: true
        });
      }

      // For PASSWORD_RESET, return success message
      if (type === 'PASSWORD_RESET') {
        return res.status(200).json({
          message: 'Verification successful. You can now reset your password.',
          verified: true
        });
      }

    } catch (error) {
      logError(error, {
        context: 'verification.verify',
        identifier: req.body.identifier?.replace(/\w(?=\w{2})/g, '*'),
        type: req.body.type
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// @desc    Get verification method
// @route   GET /api/verification/method
// @access  Public
router.get('/method', (req, res) => {
  res.json({
    method: verificationService.getVerificationMethod(),
    supportedMethods: ['SMS', 'EMAIL']
  });
});

// @desc    Set verification method (Admin only)
// @route   POST /api/verification/method
// @access  Private (Admin)
router.post('/method',
  [
    body('method')
      .isIn(['SMS', 'EMAIL'])
      .withMessage('Method must be either SMS or EMAIL')
  ],
  (req, res) => {
    const { method } = req.body;
    const success = verificationService.setVerificationMethod(method);
    
    if (success) {
      logSystemEvent('verification_method_changed', {
        newMethod: method,
        changedBy: req.user?.userId || 'system'
      });
      
      res.json({
        message: `Verification method changed to ${method}`,
        method: verificationService.getVerificationMethod()
      });
    } else {
      res.status(400).json({
        error: 'Invalid verification method'
      });
    }
  }
);

// @desc    Resend verification code
// @route   POST /api/verification/resend
// @access  Public
router.post('/resend',
  verificationLimiter,
  [
    body('identifier')
      .notEmpty()
      .withMessage('Phone number or email is required'),
    body('type')
      .isIn(['LOGIN', 'EMAIL_VERIFICATION', 'PASSWORD_RESET'])
      .withMessage('Invalid verification type'),
    body('method')
      .optional()
      .isIn(['SMS', 'EMAIL', 'AUTO'])
      .withMessage('Method must be SMS, EMAIL, or AUTO')
  ],
  async (req, res) => {
    try {
      const { identifier, type, method = 'AUTO' } = req.body;
      const requestInfo = verificationService.getRequestContext(req);

      // Determine verification method
      let verificationMethod = method;
      if (method === 'AUTO') {
        // Auto-detect based on identifier
        verificationMethod = identifier.includes('@') ? 'EMAIL' : 'SMS';
      }

      // Validate method compatibility with identifier
      if (verificationMethod === 'EMAIL' && !identifier.includes('@')) {
        return res.status(400).json({
          error: 'Email verification requires a valid email address'
        });
      }

      if (verificationMethod === 'SMS' && identifier.includes('@')) {
        return res.status(400).json({
          error: 'SMS verification requires a valid phone number'
        });
      }

      logUserActivity('verification_resend_requested', null, identifier.replace(/\w(?=\w{2})/g, '*'), {
        type,
        method: verificationMethod,
        userChoice: method,
        ...requestInfo
      });

      // Check if user exists for LOGIN and PASSWORD_RESET
      if (type === 'LOGIN' || type === 'PASSWORD_RESET') {
        const user = await User.findOne({
          $or: [
            { phone: identifier },
            { email: identifier }
          ]
        });

        if (!user) {
          return res.status(404).json({
            error: 'User not found with this phone number or email'
          });
        }
      }

      // Temporarily set the verification method for this request
      const originalMethod = verificationService.getVerificationMethod();
      verificationService.setVerificationMethod(verificationMethod);

      // Send verification code
      const result = await verificationService.sendVerificationCode(
        identifier,
        type,
        'User',
        requestInfo
      );

      // Restore original method
      verificationService.setVerificationMethod(originalMethod);

      if (!result.success) {
        return res.status(500).json({
          error: result.error || 'Failed to resend verification code'
        });
      }

      res.status(200).json({
        message: 'Verification code resent successfully',
        method: verificationMethod,
        userChoice: method,
        expiresAt: result.expiresAt
      });

    } catch (error) {
      logError(error, {
        context: 'verification.resend',
        identifier: req.body.identifier?.replace(/\w(?=\w{2})/g, '*'),
        type: req.body.type,
        method: req.body.method
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

module.exports = router; 