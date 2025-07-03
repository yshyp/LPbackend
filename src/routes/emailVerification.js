const express = require('express');
const { body, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');
const EmailVerification = require('../models/EmailVerification');
const User = require('../models/User');
const emailService = require('../services/emailService');
const { logUserActivity, logError, logSystemEvent } = require('../services/loggerService');
const { getRequestContext } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for email verification endpoints
const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many email verification requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSystemEvent('email_verification_rate_limit_exceeded', {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    res.status(429).json({
      error: 'Too many email verification requests, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Rate limiting for token verification
const tokenVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many token verification attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSystemEvent('token_verification_rate_limit_exceeded', {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    res.status(429).json({
      error: 'Too many token verification attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Send email verification
router.post('/send-verification', 
  emailVerificationLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('type')
      .isIn(['EMAIL_VERIFICATION', 'PASSWORD_RESET'])
      .withMessage('Invalid verification type')
  ],
  async (req, res) => {
    try {
      const { email, type } = req.body;
      const context = getRequestContext(req);

      logUserActivity('email_verification_requested', null, email.replace(/\w(?=\w{2})/g, '*'), {
        type,
        ...context
      });

      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        logSystemEvent('email_verification_user_not_found', {
          email: email.replace(/\w(?=\w{2})/g, '*'),
          type,
          ...context
        });
        return res.status(404).json({
          error: 'User not found with this email address'
        });
      }

      // Check if email is already verified for EMAIL_VERIFICATION type
      if (type === 'EMAIL_VERIFICATION' && user.emailVerified) {
        logSystemEvent('email_verification_already_verified', {
          userId: user._id,
          email: email.replace(/\w(?=\w{2})/g, '*'),
          ...context
        });
        return res.status(400).json({
          error: 'Email is already verified'
        });
      }

      // Create verification token
      const verification = await EmailVerification.createVerification(
        user._id,
        email,
        type,
        context.ipAddress,
        context.userAgent
      );

      // Send verification email
      const emailResult = await emailService.sendVerificationEmail(
        email,
        verification.token,
        user.name
      );

      if (!emailResult.success) {
        logError(new Error(emailResult.error), {
          context: 'emailVerification.send-verification',
          userId: user._id,
          email: email.replace(/\w(?=\w{2})/g, '*'),
          type
        });
        return res.status(500).json({
          error: 'Failed to send verification email. Please try again later.'
        });
      }

      logUserActivity('email_verification_sent', user._id, user.phone, {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        type,
        messageId: emailResult.messageId,
        ...context
      });

      res.status(200).json({
        message: 'Verification email sent successfully',
        type,
        expiresAt: verification.expiresAt
      });

    } catch (error) {
      logError(error, {
        context: 'emailVerification.send-verification',
        email: req.body.email?.replace(/\w(?=\w{2})/g, '*'),
        type: req.body.type
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Verify email token
router.post('/verify-token',
  tokenVerificationLimiter,
  [
    body('token')
      .isLength({ min: 64, max: 64 })
      .withMessage('Invalid token format'),
    body('type')
      .isIn(['EMAIL_VERIFICATION', 'PASSWORD_RESET'])
      .withMessage('Invalid verification type')
  ],
  async (req, res) => {
    try {
      const { token, type } = req.body;
      const context = getRequestContext(req);

      logUserActivity('email_verification_token_attempt', null, 'anonymous', {
        token: token.substring(0, 8) + '...',
        type,
        ...context
      });

      // Verify token
      const verificationResult = await EmailVerification.verifyToken(
        token,
        type,
        context.ipAddress,
        context.userAgent
      );

      if (!verificationResult.valid) {
        return res.status(400).json({
          error: verificationResult.error
        });
      }

      const { verification } = verificationResult;

      // Find user
      const user = await User.findById(verification.userId);
      if (!user) {
        logSystemEvent('email_verification_user_not_found_after_token', {
          userId: verification.userId,
          email: verification.email.replace(/\w(?=\w{2})/g, '*'),
          type,
          ...context
        });
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Mark token as used
      await EmailVerification.markAsUsed(token, type);

      // Handle different verification types
      if (type === 'EMAIL_VERIFICATION') {
        // Verify user's email
        await user.verifyEmail();

        // Send welcome email
        const welcomeEmailResult = await emailService.sendWelcomeEmail(
          user.email,
          user.name,
          user.role
        );

        if (welcomeEmailResult.success) {
          logSystemEvent('welcome_email_sent_after_verification', {
            userId: user._id,
            email: user.email.replace(/\w(?=\w{2})/g, '*'),
            messageId: welcomeEmailResult.messageId
          });
        }

        logUserActivity('email_verification_completed', user._id, user.phone, {
          email: user.email.replace(/\w(?=\w{2})/g, '*'),
          ...context
        });

        res.status(200).json({
          message: 'Email verified successfully',
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified,
            emailVerifiedAt: user.emailVerifiedAt
          }
        });

      } else if (type === 'PASSWORD_RESET') {
        // For password reset, just return success - frontend will handle password change
        logUserActivity('password_reset_token_verified', user._id, user.phone, {
          email: user.email.replace(/\w(?=\w{2})/g, '*'),
          ...context
        });

        res.status(200).json({
          message: 'Password reset token verified successfully',
          userId: user._id,
          email: user.email
        });
      }

    } catch (error) {
      logError(error, {
        context: 'emailVerification.verify-token',
        token: req.body.token?.substring(0, 8) + '...',
        type: req.body.type
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Resend verification email
router.post('/resend-verification',
  emailVerificationLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
  ],
  async (req, res) => {
    try {
      const { email } = req.body;
      const context = getRequestContext(req);

      logUserActivity('email_verification_resend_requested', null, email.replace(/\w(?=\w{2})/g, '*'), {
        ...context
      });

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          error: 'User not found with this email address'
        });
      }

      // Check if already verified
      if (user.emailVerified) {
        return res.status(400).json({
          error: 'Email is already verified'
        });
      }

      // Create new verification token
      const verification = await EmailVerification.createVerification(
        user._id,
        email,
        'EMAIL_VERIFICATION',
        context.ipAddress,
        context.userAgent
      );

      // Send verification email
      const emailResult = await emailService.sendVerificationEmail(
        email,
        verification.token,
        user.name
      );

      if (!emailResult.success) {
        return res.status(500).json({
          error: 'Failed to send verification email. Please try again later.'
        });
      }

      logUserActivity('email_verification_resent', user._id, user.phone, {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        messageId: emailResult.messageId,
        ...context
      });

      res.status(200).json({
        message: 'Verification email resent successfully',
        expiresAt: verification.expiresAt
      });

    } catch (error) {
      logError(error, {
        context: 'emailVerification.resend-verification',
        email: req.body.email?.replace(/\w(?=\w{2})/g, '*')
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get verification status
router.get('/status/:email',
  [
    param('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
  ],
  async (req, res) => {
    try {
      const { email } = req.params;
      const context = getRequestContext(req);

      logUserActivity('email_verification_status_requested', null, email.replace(/\w(?=\w{2})/g, '*'), {
        ...context
      });

      const user = await User.findOne({ email }).select('emailVerified emailVerifiedAt');
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      res.status(200).json({
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt
      });

    } catch (error) {
      logError(error, {
        context: 'emailVerification.status',
        email: req.params.email?.replace(/\w(?=\w{2})/g, '*')
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Admin endpoint to get verification stats
router.get('/stats',
  async (req, res) => {
    try {
      const context = getRequestContext(req);

      logSystemEvent('email_verification_stats_requested', {
        ...context
      });

      const stats = await EmailVerification.getStats();
      const cleanupResult = await EmailVerification.cleanupExpired();

      res.status(200).json({
        stats,
        cleanup: {
          expiredTokensRemoved: cleanupResult
        }
      });

    } catch (error) {
      logError(error, {
        context: 'emailVerification.stats'
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Admin endpoint to test email service
router.post('/test-email',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
  ],
  async (req, res) => {
    try {
      const { email } = req.body;
      const context = getRequestContext(req);

      logSystemEvent('email_service_test_requested', {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        ...context
      });

      const connectionTest = await emailService.verifyConnection();
      
      if (!connectionTest) {
        return res.status(500).json({
          error: 'Email service is not properly configured'
        });
      }

      // Send a test email
      const testResult = await emailService.sendVerificationEmail(
        email,
        'test-token-1234567890abcdef',
        'Test User'
      );

      if (!testResult.success) {
        return res.status(500).json({
          error: 'Failed to send test email',
          details: testResult.error
        });
      }

      res.status(200).json({
        message: 'Test email sent successfully',
        messageId: testResult.messageId
      });

    } catch (error) {
      logError(error, {
        context: 'emailVerification.test-email',
        email: req.body.email?.replace(/\w(?=\w{2})/g, '*')
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

module.exports = router; 