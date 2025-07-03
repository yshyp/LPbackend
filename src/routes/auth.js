const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const OTP = require('../models/OTP');
const EmailVerification = require('../models/EmailVerification');
const whatsappService = require('../services/whatsappService');
const emailService = require('../services/emailService');
const { auth } = require('../middleware/auth');
const { logUserActivity, logError, logSecurity, logOTP } = require('../services/loggerService');

const router = express.Router();

// Helper function to get client IP
const getClientIP = (req) => {
  return req.headers['x-forwarded-for'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.ip;
};

// Helper function to get request info
const getRequestInfo = (req) => ({
  ip: getClientIP(req),
  userAgent: req.get('User-Agent'),
  method: req.method,
  path: req.path
});

// @desc    Register verified user (after email/SMS verification)
// @route   POST /api/auth/register-verified
// @access  Public
router.post('/register-verified', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().isEmail().withMessage('Please enter a valid email'),
  body('phone').optional().trim().matches(/^\+?[\d\s-()]+$/).withMessage('Please enter a valid phone number'),
  body('bloodGroup').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood group'),
  body('role').isIn(['DONOR', 'REQUESTER']).withMessage('Role must be either DONOR or REQUESTER'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('fcmToken').optional().isString().withMessage('FCM token must be a string')
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('verified_registration_validation_failed', {
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { name, email, phone, bloodGroup, role, longitude, latitude, fcmToken } = req.body;

    // Ensure at least one identifier is provided
    if (!email && !phone) {
      return res.status(400).json({ 
        error: 'Either email or phone number is required' 
      });
    }

    // Clean up phone value to prevent duplicate key errors
    const cleanPhone = phone && phone.trim() !== '' ? phone.trim() : undefined;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        ...(email ? [{ email }] : []),
        ...(cleanPhone ? [{ phone: cleanPhone }] : [])
      ]
    });

    if (existingUser) {
      logSecurity('verified_registration_duplicate_user', {
        phone: cleanPhone,
        email,
        existingUserId: existingUser._id,
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'User already exists with this email or phone number' 
      });
    }

    // Create user without password (already verified)
    const userData = {
      name,
      email,
      phone: cleanPhone, // Use cleaned phone value
      bloodGroup,
      role,
      fcmToken,
      isVerified: true, // Mark as verified since they went through verification
      emailVerified: email ? true : false, // Mark email as verified if provided
      emailVerifiedAt: email ? new Date() : null,
      verificationPreference: email ? 'EMAIL' : 'SMS'
    };

    // Only add location if we have valid coordinates (not 0,0)
    if (longitude && latitude && longitude !== 0 && latitude !== 0) {
      userData.location = {
        type: 'Point',
        coordinates: [longitude, latitude]
      };
    } else {
      // Explicitly ensure location is not included
      delete userData.location;
    }

    console.log('🔍 User data being passed to User model:', JSON.stringify(userData, null, 2));
    console.log('🔍 Longitude:', longitude, 'Latitude:', latitude);

    const user = new User(userData);

    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logUserActivity('verified_user_registered', user._id, phone || email, {
      role,
      bloodGroup,
      hasLocation: !!(longitude && latitude),
      ...requestInfo
    });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        bloodGroup: user.bloodGroup,
        location: user.location,
        availability: user.availability,
        isVerified: user.isVerified,
        emailVerified: user.emailVerified,
        verificationPreference: user.verificationPreference,
        lastVerificationMethod: user.lastVerificationMethod,
        lastDonatedAt: user.lastDonatedAt,
        medicalHistory: user.medicalHistory,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    logError(error, {
      context: 'auth.register-verified',
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Registration failed',
      message: error.message 
    });
  }
});

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('phone').trim().matches(/^\+?[\d\s-()]+$/).withMessage('Please enter a valid phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('bloodGroup').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood group'),
  body('role').isIn(['DONOR', 'REQUESTER']).withMessage('Role must be either DONOR or REQUESTER'),
  body('verificationPreference').optional().isIn(['SMS', 'EMAIL', 'BOTH']).withMessage('Verification preference must be SMS, EMAIL, or BOTH')
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('registration_validation_failed', {
        phone: req.body.phone,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { name, email, phone, password, bloodGroup, role, fcmToken, verificationPreference = 'SMS' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phone }] 
    });

    if (existingUser) {
      logSecurity('registration_duplicate_user', {
        phone,
        email,
        existingUserId: existingUser._id,
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'User already exists with this email or phone number' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      bloodGroup,
      role,
      fcmToken,
      verificationPreference
    });

    await user.save();

    // Send verification based on preference
    let verificationSent = false;
    let verificationMethod = null;

    if (verificationPreference === 'EMAIL' || verificationPreference === 'BOTH') {
      try {
        const verification = await EmailVerification.createVerification(
          user._id,
          user.email,
          'EMAIL_VERIFICATION',
          requestInfo.ip,
          requestInfo.userAgent
        );

        const emailResult = await emailService.sendVerificationEmail(
          user.email,
          verification.token,
          user.name
        );

        if (emailResult.success) {
          verificationSent = true;
          verificationMethod = 'EMAIL';
          logUserActivity('email_verification_sent_after_registration', user._id, phone, {
            email: user.email.replace(/\w(?=\w{2})/g, '*'),
            messageId: emailResult.messageId,
            verificationPreference,
            ...requestInfo
          });
        } else {
          logError(new Error(emailResult.error), {
            context: 'auth.register.email_verification',
            userId: user._id,
            email: user.email.replace(/\w(?=\w{2})/g, '*'),
            verificationPreference,
            ...requestInfo
          });
        }
      } catch (emailError) {
        logError(emailError, {
          context: 'auth.register.email_verification',
          userId: user._id,
          email: user.email.replace(/\w(?=\w{2})/g, '*'),
          verificationPreference,
          ...requestInfo
        });
      }
    }

    if (verificationPreference === 'SMS' || (verificationPreference === 'BOTH' && !verificationSent)) {
      try {
        // Generate and save OTP
        const otpRecord = await OTP.createOTP(phone, 'REGISTRATION', 10, requestInfo);

        // Send OTP via WhatsApp/SMS
        const formattedPhone = whatsappService.formatPhoneNumber(phone);
        const sendResult = await whatsappService.sendOTP(formattedPhone, otpRecord.otp, 'REGISTRATION');

        if (sendResult.success) {
          verificationSent = true;
          verificationMethod = 'SMS';
          logOTP('sent_successfully', phone, 'REGISTRATION', {
            otpId: otpRecord._id,
            method: sendResult.method || 'whatsapp',
            verificationPreference,
            ...requestInfo
          });
        } else {
          // Delete the OTP if sending failed
          await OTP.findByIdAndDelete(otpRecord._id);
          logError(new Error('OTP sending failed'), {
            context: 'auth.register.sms_verification',
            phone,
            otpId: otpRecord._id,
            sendResult,
            verificationPreference,
            ...requestInfo
          });
        }
      } catch (smsError) {
        logError(smsError, {
          context: 'auth.register.sms_verification',
          userId: user._id,
          phone,
          verificationPreference,
          ...requestInfo
        });
      }
    }

    // Update user with verification method used
    if (verificationMethod) {
      user.lastVerificationMethod = verificationMethod;
      await user.save();
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logUserActivity('registered', user._id, phone, {
      role,
      bloodGroup,
      verificationPreference,
      verificationMethod,
      verificationSent,
      ...requestInfo
    });

    const responseMessage = verificationSent 
      ? `Registration successful. Please check your ${verificationMethod === 'EMAIL' ? 'email' : 'phone'} to verify your account.`
      : 'Registration successful. Please contact support for verification.';

    res.status(201).json({
      message: responseMessage,
      token,
      verificationMethod,
      verificationSent,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        bloodGroup: user.bloodGroup,
        location: user.location,
        availability: user.availability,
        isVerified: user.isVerified,
        emailVerified: user.emailVerified,
        verificationPreference: user.verificationPreference,
        lastVerificationMethod: user.lastVerificationMethod,
        lastDonatedAt: user.lastDonatedAt,
        medicalHistory: user.medicalHistory,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    logError(error, {
      context: 'auth.register',
      phone: req.body.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Registration failed',
      message: error.message 
    });
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', [
  body('phone').trim().matches(/^\+?[\d\s-()]+$/).withMessage('Please enter a valid phone number'),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('login_validation_failed', {
        phone: req.body.phone,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { phone, password, fcmToken } = req.body;

    // Find user
    const user = await User.findOne({ phone });
    if (!user) {
      logSecurity('login_user_not_found', {
        phone,
        ...requestInfo
      });
      
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logSecurity('login_invalid_password', {
        phone,
        userId: user._id,
        ...requestInfo
      });
      
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Update FCM token if provided
    if (fcmToken && fcmToken !== user.fcmToken) {
      user.fcmToken = fcmToken;
      await user.save();
    }

    // Mark user as verified if not already
    if (!user.isVerified) {
      user.isVerified = true;
      await user.save();
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logUserActivity('logged_in', user._id, phone, {
      role: user.role,
      fcmTokenUpdated: fcmToken && fcmToken !== user.fcmToken,
      ...requestInfo
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        bloodGroup: user.bloodGroup,
        location: user.location,
        availability: user.availability,
        isVerified: user.isVerified,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        verificationPreference: user.verificationPreference,
        lastVerificationMethod: user.lastVerificationMethod,
        lastDonatedAt: user.lastDonatedAt,
        medicalHistory: user.medicalHistory,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    logError(error, {
      context: 'auth.login',
      phone: req.body.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Login failed',
      message: error.message 
    });
  }
});

// @desc    Send OTP for login/registration
// @route   POST /api/auth/send-otp
// @access  Public
router.post('/send-otp', [
  body('phone')
    .trim()
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please enter a valid phone number'),
  body('type')
    .isIn(['LOGIN', 'REGISTRATION'])
    .withMessage('Type must be either LOGIN or REGISTRATION')
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('send_otp_validation_failed', {
        phone: req.body.phone,
        type: req.body.type,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { phone, type } = req.body;

    // Check if user exists for LOGIN type
    if (type === 'LOGIN') {
      const user = await User.findOne({ phone });
      if (!user) {
        logSecurity('send_otp_login_user_not_found', {
          phone,
          type,
          ...requestInfo
        });
        
        return res.status(404).json({ 
          error: 'User not found. Please register first.' 
        });
      }
    }

    // Check if user already exists for REGISTRATION type
    if (type === 'REGISTRATION') {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        logSecurity('send_otp_registration_user_exists', {
          phone,
          type,
          existingUserId: existingUser._id,
          ...requestInfo
        });
        
        return res.status(400).json({ 
          error: 'User already exists. Please login instead.' 
        });
      }
    }

    // Check OTP rate limiting (max 5 OTPs per hour per phone)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOTPs = await OTP.countDocuments({
      phone,
      type,
      createdAt: { $gte: oneHourAgo }
    });

    if (recentOTPs >= 5) {
      logSecurity('send_otp_rate_limit_exceeded', {
        phone,
        type,
        recentOTPs,
        ...requestInfo
      });
      
      return res.status(429).json({ 
        error: 'Too many OTP requests. Please wait before requesting another OTP.' 
      });
    }

    // Generate and save OTP with request info
    const otpRecord = await OTP.createOTP(phone, type, 10, requestInfo);

    // Send OTP via WhatsApp/SMS
    const formattedPhone = whatsappService.formatPhoneNumber(phone);
    const sendResult = await whatsappService.sendOTP(formattedPhone, otpRecord.otp, type);

    if (!sendResult.success) {
      // Delete the OTP if sending failed
      await OTP.findByIdAndDelete(otpRecord._id);
      
      logError(new Error('OTP sending failed'), {
        context: 'auth.send_otp',
        phone,
        type,
        otpId: otpRecord._id,
        sendResult,
        ...requestInfo
      });
      
      return res.status(500).json({ 
        error: 'Failed to send OTP. Please try again.' 
      });
    }

    logOTP('sent_successfully', phone, type, {
      otpId: otpRecord._id,
      method: sendResult.method || 'whatsapp',
      ...requestInfo
    });

    res.json({ 
      message: 'OTP sent successfully',
      method: sendResult.method || 'whatsapp',
      expiresIn: '10 minutes'
    });

  } catch (error) {
    logError(error, {
      context: 'auth.send_otp',
      phone: req.body.phone,
      type: req.body.type,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to send OTP',
      message: error.message 
    });
  }
});

// @desc    Verify OTP and login/register user
// @route   POST /api/auth/verify-otp
// @access  Public
router.post('/verify-otp', [
  body('phone')
    .trim()
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please enter a valid phone number'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be 6 digits'),
  body('type')
    .isIn(['LOGIN', 'REGISTRATION'])
    .withMessage('Type must be either LOGIN or REGISTRATION')
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('verify_otp_validation_failed', {
        phone: req.body.phone,
        type: req.body.type,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { phone, otp, type, userData, fcmToken } = req.body;

    // Verify OTP with request info
    const verificationResult = await OTP.verifyOTP(phone, otp, type, requestInfo);
    
    if (!verificationResult.valid) {
      logSecurity('verify_otp_failed', {
        phone,
        type,
        reason: verificationResult.message,
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: verificationResult.message 
      });
    }

    let user;
    let token;

    if (type === 'REGISTRATION') {
      // Create new user
      if (!userData) {
        logSecurity('verify_otp_registration_no_userdata', {
          phone,
          type,
          ...requestInfo
        });
        
        return res.status(400).json({ 
          error: 'User data is required for registration' 
        });
      }

      // Validate user data
      const registerErrors = validationResult(req);
      if (!registerErrors.isEmpty()) {
        logSecurity('verify_otp_registration_invalid_data', {
          phone,
          type,
          errors: registerErrors.array(),
          ...requestInfo
        });
        
        return res.status(400).json({ 
          error: 'Invalid user data',
          details: registerErrors.array() 
        });
      }
      
      user = await User.create({
        ...userData,
        phone,
        isVerified: true
      });

      token = jwt.sign(
        { userId: user._id, phone: user.phone },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      
      logUserActivity('registered_via_otp', user._id, phone, {
        role: userData.role,
        bloodGroup: userData.bloodGroup,
        ...requestInfo
      });
      
      res.status(201).json({
        message: 'Registration successful',
        token,
        user: {
          _id: user._id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          bloodGroup: user.bloodGroup,
          location: user.location,
          availability: user.availability,
          isVerified: user.isVerified,
          lastDonatedAt: user.lastDonatedAt,
          medicalHistory: user.medicalHistory,
          createdAt: user.createdAt
        }
      });

    } else if (type === 'LOGIN') {
      // Login existing user
      user = await User.findOne({ phone });
      
      if (!user) {
        logSecurity('verify_otp_login_user_not_found', {
          phone,
          type,
          ...requestInfo
        });
        
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      // Update FCM token if provided
      if (fcmToken && fcmToken !== user.fcmToken) {
        user.fcmToken = fcmToken;
        await user.save();
      }

      // Mark user as verified if not already
      if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
      }

      token = jwt.sign(
        { userId: user._id, phone: user.phone },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      logUserActivity('logged_in_via_otp', user._id, phone, {
        role: user.role,
        fcmTokenUpdated: fcmToken && fcmToken !== user.fcmToken,
        ...requestInfo
      });

      res.json({
        message: 'Login successful',
        token,
        user: {
          _id: user._id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          bloodGroup: user.bloodGroup,
          location: user.location,
          availability: user.availability,
          isVerified: user.isVerified,
          emailVerified: user.emailVerified,
          emailVerifiedAt: user.emailVerifiedAt,
          verificationPreference: user.verificationPreference,
          lastVerificationMethod: user.lastVerificationMethod,
          lastDonatedAt: user.lastDonatedAt,
          medicalHistory: user.medicalHistory,
          createdAt: user.createdAt
        }
      });
    }

  } catch (error) {
    logError(error, {
      context: 'auth.verify_otp',
      phone: req.body.phone,
      type: req.body.type,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Verification failed',
      message: error.message 
    });
  }
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      logSecurity('get_user_not_found', {
        userId: req.user.userId,
        ...getRequestInfo(req)
      });
      
      return res.status(404).json({ error: 'User not found' });
    }
    
    logUserActivity('profile_accessed', user._id, user.phone, {
      ...getRequestInfo(req)
    });
    
    res.json(user);
  } catch (error) {
    logError(error, {
      context: 'auth.me',
      userId: req.user.userId,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ error: 'Server error' });
  }
});

// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Please enter a valid email address').normalizeEmail()
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('forgot_password_validation_failed', {
        email: req.body.email?.replace(/\w(?=\w{2})/g, '*'),
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      logSecurity('forgot_password_user_not_found', {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        ...requestInfo
      });
      
      // Don't reveal if user exists or not for security
      return res.status(200).json({ 
        message: 'If an account with this email exists, a password reset link has been sent.' 
      });
    }

    // Create password reset token
    const verification = await EmailVerification.createVerification(
      user._id,
      email,
      'PASSWORD_RESET',
      requestInfo.ip,
      requestInfo.userAgent
    );

    // Send password reset email
    const emailResult = await emailService.sendPasswordResetEmail(
      email,
      verification.token,
      user.name
    );

    if (!emailResult.success) {
      logError(new Error(emailResult.error), {
        context: 'auth.forgot_password',
        userId: user._id,
        email: email.replace(/\w(?=\w{2})/g, '*'),
        ...requestInfo
      });
      
      return res.status(500).json({ 
        error: 'Failed to send password reset email. Please try again later.' 
      });
    }

    logUserActivity('password_reset_requested', user._id, user.phone, {
      email: email.replace(/\w(?=\w{2})/g, '*'),
      messageId: emailResult.messageId,
      ...requestInfo
    });

    res.status(200).json({ 
      message: 'If an account with this email exists, a password reset link has been sent.' 
    });

  } catch (error) {
    logError(error, {
      context: 'auth.forgot_password',
      email: req.body.email?.replace(/\w(?=\w{2})/g, '*'),
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Password reset request failed',
      message: error.message 
    });
  }
});

// @desc    Reset password with token
// @route   POST /api/auth/reset-password
// @access  Public
router.post('/reset-password', [
  body('token')
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid token format'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('reset_password_validation_failed', {
        token: req.body.token?.substring(0, 8) + '...',
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { token, password } = req.body;

    // Verify token
    const verificationResult = await EmailVerification.verifyToken(
      token,
      'PASSWORD_RESET',
      requestInfo.ip,
      requestInfo.userAgent
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
      logSecurity('reset_password_user_not_found', {
        userId: verification.userId,
        email: verification.email.replace(/\w(?=\w{2})/g, '*'),
        ...requestInfo
      });
      
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    // Mark token as used
    await EmailVerification.markAsUsed(token, 'PASSWORD_RESET');

    logUserActivity('password_reset_completed', user._id, user.phone, {
      email: user.email.replace(/\w(?=\w{2})/g, '*'),
      ...requestInfo
    });

    res.status(200).json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    logError(error, {
      context: 'auth.reset_password',
      token: req.body.token?.substring(0, 8) + '...',
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Password reset failed',
      message: error.message 
    });
  }
});

// @desc    Update verification preference
// @route   PUT /api/auth/verification-preference
// @access  Private
router.put('/verification-preference', [
  auth,
  body('verificationPreference')
    .isIn(['SMS', 'EMAIL', 'BOTH'])
    .withMessage('Verification preference must be SMS, EMAIL, or BOTH')
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('verification_preference_validation_failed', {
        userId: req.user.userId,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { verificationPreference } = req.body;

    // Find user
    const user = await User.findById(req.user.userId);
    if (!user) {
      logSecurity('verification_preference_user_not_found', {
        userId: req.user.userId,
        ...requestInfo
      });
      
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    const oldPreference = user.verificationPreference;
    user.verificationPreference = verificationPreference;
    await user.save();

    logUserActivity('verification_preference_updated', user._id, user.phone, {
      oldPreference,
      newPreference: verificationPreference,
      ...requestInfo
    });

    res.json({
      message: 'Verification preference updated successfully',
      verificationPreference: user.verificationPreference
    });

  } catch (error) {
    logError(error, {
      context: 'auth.verification_preference',
      userId: req.user.userId,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to update verification preference',
      message: error.message 
    });
  }
});

// @desc    Send verification code (SMS or Email)
// @route   POST /api/auth/send-verification
// @access  Private
router.post('/send-verification', [
  auth,
  body('method')
    .isIn(['SMS', 'EMAIL'])
    .withMessage('Method must be SMS or EMAIL')
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('send_verification_validation_failed', {
        userId: req.user.userId,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { method } = req.body;

    // Find user
    const user = await User.findById(req.user.userId);
    if (!user) {
      logSecurity('send_verification_user_not_found', {
        userId: req.user.userId,
        ...requestInfo
      });
      
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    let verificationSent = false;
    let verificationMethod = null;

    if (method === 'EMAIL') {
      try {
        const verification = await EmailVerification.createVerification(
          user._id,
          user.email,
          'EMAIL_VERIFICATION',
          requestInfo.ip,
          requestInfo.userAgent
        );

        const emailResult = await emailService.sendVerificationEmail(
          user.email,
          verification.token,
          user.name
        );

        if (emailResult.success) {
          verificationSent = true;
          verificationMethod = 'EMAIL';
          logUserActivity('email_verification_sent_manual', user._id, user.phone, {
            email: user.email.replace(/\w(?=\w{2})/g, '*'),
            messageId: emailResult.messageId,
            ...requestInfo
          });
        } else {
          logError(new Error(emailResult.error), {
            context: 'auth.send_verification.email',
            userId: user._id,
            email: user.email.replace(/\w(?=\w{2})/g, '*'),
            ...requestInfo
          });
        }
      } catch (emailError) {
        logError(emailError, {
          context: 'auth.send_verification.email',
          userId: user._id,
          email: user.email.replace(/\w(?=\w{2})/g, '*'),
          ...requestInfo
        });
      }
    } else if (method === 'SMS') {
      try {
        // Generate and save OTP
        const otpRecord = await OTP.createOTP(user.phone, 'VERIFICATION', 10, requestInfo);

        // Send OTP via WhatsApp/SMS
        const formattedPhone = whatsappService.formatPhoneNumber(user.phone);
        const sendResult = await whatsappService.sendOTP(formattedPhone, otpRecord.otp, 'VERIFICATION');

        if (sendResult.success) {
          verificationSent = true;
          verificationMethod = 'SMS';
          logOTP('sent_successfully', user.phone, 'VERIFICATION', {
            otpId: otpRecord._id,
            method: sendResult.method || 'whatsapp',
            ...requestInfo
          });
        } else {
          // Delete the OTP if sending failed
          await OTP.findByIdAndDelete(otpRecord._id);
          logError(new Error('OTP sending failed'), {
            context: 'auth.send_verification.sms',
            userId: user._id,
            phone: user.phone,
            otpId: otpRecord._id,
            sendResult,
            ...requestInfo
          });
        }
      } catch (smsError) {
        logError(smsError, {
          context: 'auth.send_verification.sms',
          userId: user._id,
          phone: user.phone,
          ...requestInfo
        });
      }
    }

    // Update user with verification method used
    if (verificationMethod) {
      user.lastVerificationMethod = verificationMethod;
      await user.save();
    }

    logUserActivity('verification_sent_manual', user._id, user.phone, {
      method,
      verificationSent,
      verificationMethod,
      ...requestInfo
    });

    const responseMessage = verificationSent 
      ? `Verification code sent successfully to your ${verificationMethod === 'EMAIL' ? 'email' : 'phone'}.`
      : `Failed to send verification code to your ${method.toLowerCase()}. Please try again.`;

    res.json({
      message: responseMessage,
      verificationSent,
      verificationMethod
    });

  } catch (error) {
    logError(error, {
      context: 'auth.send_verification',
      userId: req.user.userId,
      method: req.body.method,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to send verification code',
      message: error.message 
    });
  }
});

// @desc    Verify code (SMS OTP or Email Token)
// @route   POST /api/auth/verify-code
// @access  Public
router.post('/verify-code', [
  body('method')
    .isIn(['SMS', 'EMAIL'])
    .withMessage('Method must be SMS or EMAIL'),
  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please enter a valid phone number'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please enter a valid email address'),
  body('code')
    .notEmpty()
    .withMessage('Verification code is required')
], async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logSecurity('verify_code_validation_failed', {
        method: req.body.method,
        errors: errors.array(),
        ...requestInfo
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { method, phone, email, code } = req.body;

    let user;
    let verificationResult;

    if (method === 'SMS') {
      if (!phone) {
        return res.status(400).json({
          error: 'Phone number is required for SMS verification'
        });
      }

      // Find user by phone
      user = await User.findOne({ phone });
      if (!user) {
        logSecurity('verify_code_sms_user_not_found', {
          phone,
          method,
          ...requestInfo
        });
        
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      // Verify OTP
      verificationResult = await OTP.verifyOTP(phone, code, 'VERIFICATION', requestInfo);
      
      if (!verificationResult.valid) {
        logSecurity('verify_code_sms_failed', {
          phone,
          method,
          reason: verificationResult.message,
          ...requestInfo
        });
        
        return res.status(400).json({ 
          error: verificationResult.message 
        });
      }

    } else if (method === 'EMAIL') {
      if (!email) {
        return res.status(400).json({
          error: 'Email is required for email verification'
        });
      }

      // Find user by email
      user = await User.findOne({ email });
      if (!user) {
        logSecurity('verify_code_email_user_not_found', {
          email: email.replace(/\w(?=\w{2})/g, '*'),
          method,
          ...requestInfo
        });
        
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      // Verify email token
      verificationResult = await EmailVerification.verifyToken(
        code,
        'EMAIL_VERIFICATION',
        requestInfo.ip,
        requestInfo.userAgent
      );

      if (!verificationResult.valid) {
        logSecurity('verify_code_email_failed', {
          email: email.replace(/\w(?=\w{2})/g, '*'),
          method,
          reason: verificationResult.error,
          ...requestInfo
        });
        
        return res.status(400).json({ 
          error: verificationResult.error 
        });
      }

      // Mark token as used
      await EmailVerification.markAsUsed(code, 'EMAIL_VERIFICATION');

      // Verify user's email
      await user.verifyEmail();

      // Send welcome email
      try {
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
      } catch (welcomeError) {
        logError(welcomeError, {
          context: 'auth.verify_code.welcome_email',
          userId: user._id,
          email: user.email.replace(/\w(?=\w{2})/g, '*')
        });
      }
    }

    // Mark user as verified if not already
    if (!user.isVerified) {
      user.isVerified = true;
      await user.save();
    }

    // Update last verification method
    user.lastVerificationMethod = method;
    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logUserActivity('verification_completed', user._id, user.phone, {
      method,
      verificationType: method === 'EMAIL' ? 'email_verification' : 'sms_verification',
      ...requestInfo
    });

    res.json({
      message: `${method} verification completed successfully`,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        bloodGroup: user.bloodGroup,
        location: user.location,
        availability: user.availability,
        isVerified: user.isVerified,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        verificationPreference: user.verificationPreference,
        lastVerificationMethod: user.lastVerificationMethod,
        lastDonatedAt: user.lastDonatedAt,
        medicalHistory: user.medicalHistory,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    logError(error, {
      context: 'auth.verify_code',
      method: req.body.method,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Verification failed',
      message: error.message 
    });
  }
});

module.exports = router; 