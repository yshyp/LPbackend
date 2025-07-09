const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Helper function to get request context for logging
const getRequestContext = (req) => ({
  ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
  userAgent: req.get('User-Agent'),
  method: req.method,
  path: req.path
});

// Make sure your auth middleware is setting req.user correctly:
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log('🔐 Auth middleware - token present:', !!token);
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔐 Auth middleware - decoded token:', {
      userId: decoded.userId,
      phone: decoded.phone,
      email: decoded.email,
      iat: decoded.iat,
      exp: decoded.exp
    });
    
    // Find the user and attach to req.user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token - user not found.' });
    }
    
    req.user = user; // This sets req.user to the full user object
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired.' });
    } else {
      res.status(401).json({ error: 'Invalid token.' });
    }
  }
};

// Optional auth middleware - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-fcmToken');
    
    if (user) {
      req.user = user;
      req.token = token;
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.' 
      });
    }

    next();
  };
};

// Check if user is donor
const isDonor = authorize('DONOR');

// Check if user is requester
const isRequester = authorize('REQUESTER');

// Check if user is either donor or requester
const isDonorOrRequester = authorize('DONOR', 'REQUESTER');

// Check if user is admin
const isAdmin = authorize('ADMIN');

module.exports = {
  auth,
  optionalAuth,
  authorize,
  isAdmin,
  isDonor,
  isRequester,
  isDonorOrRequester,
  getRequestContext
};