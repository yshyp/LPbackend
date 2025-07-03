const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { logSecurity, logError, logUserActivity } = require('../services/loggerService');

// Middleware to authenticate admin
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      logSecurity('admin_auth_failed_no_token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.adminId).select('-password');

    if (!admin) {
      logSecurity('admin_auth_failed_invalid_token', {
        adminId: decoded.adminId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }

    if (!admin.isActive) {
      logSecurity('admin_auth_failed_inactive_account', {
        adminId: admin._id,
        username: admin.username,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    if (admin.isLocked()) {
      logSecurity('admin_auth_failed_locked_account', {
        adminId: admin._id,
        username: admin.username,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        lockedUntil: admin.lockedUntil
      });
      
      return res.status(401).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts.'
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    logError(error, {
      context: 'adminAuth.authenticateAdmin',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    return res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// Middleware to check admin permissions
const requirePermission = (permission) => {
  return (req, res, next) => {
    try {
      if (!req.admin) {
        logSecurity('admin_permission_check_failed_no_admin', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          requiredPermission: permission
        });
        
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      if (!req.admin.hasPermission(permission)) {
        logSecurity('admin_permission_denied', {
          adminId: req.admin._id,
          username: req.admin.username,
          role: req.admin.role,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          requiredPermission: permission,
          adminPermissions: req.admin.permissions
        });
        
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to access this resource.'
        });
      }

      next();
    } catch (error) {
      logError(error, {
        context: 'adminAuth.requirePermission',
        adminId: req.admin?._id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        requiredPermission: permission
      });
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error.'
      });
    }
  };
};

// Middleware to check if admin is super admin
const requireSuperAdmin = (req, res, next) => {
  try {
    if (!req.admin) {
      logSecurity('admin_super_admin_check_failed_no_admin', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (req.admin.role !== 'SUPER_ADMIN') {
      logSecurity('admin_super_admin_denied', {
        adminId: req.admin._id,
        username: req.admin.username,
        role: req.admin.role,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      return res.status(403).json({
        success: false,
        message: 'Super admin privileges required.'
      });
    }

    next();
  } catch (error) {
    logError(error, {
      context: 'adminAuth.requireSuperAdmin',
      adminId: req.admin?._id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
};

// Middleware to log admin activity
const logAdminActivity = (action) => {
  return (req, res, next) => {
    try {
      if (req.admin) {
        logUserActivity(action, req.admin._id, req.admin.username, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          method: req.method,
          path: req.path,
          params: req.params,
          query: req.query,
          body: req.body
        });
      }
      next();
    } catch (error) {
      logError(error, {
        context: 'adminAuth.logAdminActivity',
        adminId: req.admin?._id,
        action
      });
      next();
    }
  };
};

module.exports = {
  authenticateAdmin,
  requirePermission,
  requireSuperAdmin,
  logAdminActivity
}; 