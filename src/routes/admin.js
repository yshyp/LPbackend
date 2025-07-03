const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Admin = require('../models/Admin');
const User = require('../models/User');
const BloodRequest = require('../models/BloodRequest');
const { logUserActivity, logError, logSecurity } = require('../services/loggerService');
const { authenticateAdmin, requirePermission, requireSuperAdmin, logAdminActivity } = require('../middleware/adminAuth');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// Rate limiting for admin login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many login attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurity('admin_login_rate_limited', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again later.'
    });
  }
});

// Admin Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      logSecurity('admin_login_failed_missing_credentials', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        hasUsername: !!username,
        hasPassword: !!password
      });
      
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    const admin = await Admin.findOne({ 
      $or: [{ username }, { email: username }],
      isActive: true 
    });

    if (!admin) {
      logSecurity('admin_login_failed_user_not_found', {
        username: username.replace(/\w(?=\w{2})/g, '*'),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    if (admin.isLocked()) {
      logSecurity('admin_login_failed_account_locked', {
        adminId: admin._id,
        username: admin.username,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        lockedUntil: admin.lockedUntil
      });
      
      return res.status(401).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts.'
      });
    }

    const isPasswordValid = await admin.comparePassword(password);

    if (!isPasswordValid) {
      await admin.incrementLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    // Update login info
    await admin.updateLoginInfo(req.ip);

    // Generate JWT token
    const token = jwt.sign(
      { adminId: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logUserActivity('admin_login_success', admin._id, admin.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      role: admin.role
    });

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        admin: {
          id: admin._id,
          username: admin.username,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          profile: admin.profile,
          settings: admin.settings
        }
      }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.login',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Get admin profile
router.get('/profile', authenticateAdmin, logAdminActivity('admin_viewed_profile'), (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        admin: {
          id: req.admin._id,
          username: req.admin.username,
          email: req.admin.email,
          role: req.admin.role,
          permissions: req.admin.permissions,
          profile: req.admin.profile,
          settings: req.admin.settings,
          lastLoginAt: req.admin.lastLoginAt,
          lastLoginIP: req.admin.lastLoginIP
        }
      }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.getProfile',
      adminId: req.admin._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Update admin profile
router.put('/profile', authenticateAdmin, logAdminActivity('admin_updated_profile'), async (req, res) => {
  try {
    const { profile, settings } = req.body;
    const updates = {};

    if (profile) {
      updates.profile = { ...req.admin.profile, ...profile };
    }

    if (settings) {
      updates.settings = { ...req.admin.settings, ...settings };
    }

    const updatedAdmin = await Admin.findByIdAndUpdate(
      req.admin._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: { admin: updatedAdmin }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.updateProfile',
      adminId: req.admin._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Change admin password
router.put('/change-password', authenticateAdmin, logAdminActivity('admin_changed_password'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.'
      });
    }

    const admin = await Admin.findById(req.admin._id);
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      logSecurity('admin_password_change_failed_invalid_current', {
        adminId: req.admin._id,
        username: req.admin.username,
        ip: req.ip
      });
      
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.'
      });
    }

    admin.password = newPassword;
    await admin.save();

    res.json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (error) {
    logError(error, {
      context: 'admin.changePassword',
      adminId: req.admin._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Get dashboard statistics
router.get('/dashboard/stats', authenticateAdmin, requirePermission('viewAnalytics'), logAdminActivity('admin_viewed_dashboard_stats'), async (req, res) => {
  try {
    // User statistics
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          verified: { $sum: { $cond: ['$isEmailVerified', 1, 0] } },
          unverified: { $sum: { $cond: ['$isEmailVerified', 0, 1] } }
        }
      }
    ]);

    // Blood request statistics
    const requestStats = await BloodRequest.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalUnits: { $sum: '$units' }
        }
      }
    ]);

    // Recent activity
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email role bloodGroup createdAt');

    const recentRequests = await BloodRequest.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('requesterName bloodGroup units urgency status createdAt');

    // Admin statistics
    const adminStats = await Admin.getStats();

    res.json({
      success: true,
      data: {
        userStats,
        requestStats,
        recentUsers,
        recentRequests,
        adminStats
      }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.getDashboardStats',
      adminId: req.admin._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Get all users with pagination and filters
router.get('/users', authenticateAdmin, requirePermission('viewUsers'), logAdminActivity('admin_viewed_users'), async (req, res) => {
  try {
    const { page = 1, limit = 10, role, bloodGroup, status, search } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};

    if (role) filter.role = new RegExp(`^${role}$`, 'i');
    if (bloodGroup) filter.bloodGroup = bloodGroup;
    if (status === 'verified') filter.isEmailVerified = true;
    if (status === 'unverified') filter.isEmailVerified = false;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password');

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.getUsers',
      adminId: req.admin._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Get user details
router.get('/users/:userId', authenticateAdmin, requirePermission('viewUsers'), logAdminActivity('admin_viewed_user_details'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // Get user's blood requests
    const requests = await BloodRequest.find({
      $or: [
        { requesterId: user._id },
        { 'acceptedDonors.donorId': user._id }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        user,
        requests
      }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.getUserDetails',
      adminId: req.admin._id,
      userId: req.params.userId
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Update user status
router.put('/users/:userId/status', authenticateAdmin, requirePermission('editUsers'), logAdminActivity('admin_updated_user_status'), async (req, res) => {
  try {
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isActive },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully.`,
      data: { user }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.updateUserStatus',
      adminId: req.admin._id,
      userId: req.params.userId
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Get all blood requests with pagination and filters
router.get('/requests', authenticateAdmin, requirePermission('viewRequests'), logAdminActivity('admin_viewed_requests'), async (req, res) => {
  try {
    const { page = 1, limit = 10, status, bloodGroup, urgency, search } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};

    if (status) filter.status = status;
    if (bloodGroup) filter.bloodGroup = bloodGroup;
    if (urgency) filter.urgency = urgency;
    if (search) {
      filter.$or = [
        { requesterName: { $regex: search, $options: 'i' } },
        { hospitalName: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } }
      ];
    }

    const requests = await BloodRequest.find(filter)
      .populate('requester', 'name email phone')
      .populate('acceptedDonors.donor', 'name email phone bloodGroup')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await BloodRequest.countDocuments(filter);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.getRequests',
      adminId: req.admin._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Get blood request details
router.get('/requests/:requestId', authenticateAdmin, requirePermission('viewRequests'), logAdminActivity('admin_viewed_request_details'), async (req, res) => {
  try {
    const request = await BloodRequest.findById(req.params.requestId)
      .populate('requester', 'name email phone bloodGroup')
      .populate('acceptedDonors.donor', 'name email phone bloodGroup location');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Blood request not found.'
      });
    }

    res.json({
      success: true,
      data: { request }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.getRequestDetails',
      adminId: req.admin._id,
      requestId: req.params.requestId
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Update blood request status
router.put('/requests/:requestId/status', authenticateAdmin, requirePermission('editRequests'), logAdminActivity('admin_updated_request_status'), async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    const request = await BloodRequest.findByIdAndUpdate(
      req.params.requestId,
      { 
        status,
        adminNotes: adminNotes || request.adminNotes,
        updatedBy: req.admin._id
      },
      { new: true, runValidators: true }
    ).populate('requesterId', 'name email phone');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Blood request not found.'
      });
    }

    res.json({
      success: true,
      message: 'Request status updated successfully.',
      data: { request }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.updateRequestStatus',
      adminId: req.admin._id,
      requestId: req.params.requestId
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Get logs with pagination and filters
router.get('/logs', authenticateAdmin, requirePermission('viewLogs'), logAdminActivity('admin_viewed_logs'), async (req, res) => {
  try {
    const { page = 1, limit = 50, level, search, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    // Read log files
    const logDir = path.join(__dirname, '../../logs');
    const logFiles = await fs.readdir(logDir);
    
    let allLogs = [];

    for (const file of logFiles) {
      if (file.endsWith('.log')) {
        try {
          const content = await fs.readFile(path.join(logDir, file), 'utf8');
          const lines = content.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const logEntry = JSON.parse(line);
              allLogs.push({
                ...logEntry,
                source: file
              });
            } catch (parseError) {
              // Skip invalid JSON lines
              continue;
            }
          }
        } catch (readError) {
          continue;
        }
      }
    }

    // Apply filters
    if (level) {
      allLogs = allLogs.filter(log => log.level === level);
    }

    if (search) {
      allLogs = allLogs.filter(log => 
        JSON.stringify(log).toLowerCase().includes(search.toLowerCase())
      );
    }

    if (startDate || endDate) {
      allLogs = allLogs.filter(log => {
        const logDate = new Date(log.timestamp);
        if (startDate && logDate < new Date(startDate)) return false;
        if (endDate && logDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Sort by timestamp (newest first)
    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const total = allLogs.length;
    const paginatedLogs = allLogs.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: {
        logs: paginatedLogs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.getLogs',
      adminId: req.admin._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Get log statistics
router.get('/logs/stats', authenticateAdmin, requirePermission('viewLogs'), logAdminActivity('admin_viewed_log_stats'), async (req, res) => {
  try {
    const logDir = path.join(__dirname, '../../logs');
    const logFiles = await fs.readdir(logDir);
    
    let allLogs = [];
    const stats = {
      total: 0,
      byLevel: {},
      bySource: {},
      recentActivity: []
    };

    for (const file of logFiles) {
      if (file.endsWith('.log')) {
        try {
          const content = await fs.readFile(path.join(logDir, file), 'utf8');
          const lines = content.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const logEntry = JSON.parse(line);
              allLogs.push({
                ...logEntry,
                source: file
              });
            } catch (parseError) {
              continue;
            }
          }
        } catch (readError) {
          continue;
        }
      }
    }

    // Calculate statistics
    stats.total = allLogs.length;

    allLogs.forEach(log => {
      // By level
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      
      // By source
      stats.bySource[log.source] = (stats.bySource[log.source] || 0) + 1;
    });

    // Recent activity (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    stats.recentActivity = allLogs
      .filter(log => new Date(log.timestamp) > oneDayAgo)
      .slice(0, 10);

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.getLogStats',
      adminId: req.admin._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Admin management routes (Super Admin only)
router.get('/admins', authenticateAdmin, requireSuperAdmin, logAdminActivity('admin_viewed_admins'), async (req, res) => {
  try {
    const admins = await Admin.find().select('-password').sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { admins }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.getAdmins',
      adminId: req.admin._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Create new admin
router.post('/admins', authenticateAdmin, requireSuperAdmin, logAdminActivity('admin_created_admin'), async (req, res) => {
  try {
    const { username, email, password, role, permissions } = req.body;

    const admin = new Admin({
      username,
      email,
      password,
      role: role || 'ADMIN',
      permissions: permissions || {}
    });

    await admin.save();

    const adminData = admin.toObject();
    delete adminData.password;

    res.status(201).json({
      success: true,
      message: 'Admin created successfully.',
      data: { admin: adminData }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.createAdmin',
      adminId: req.admin._id
    });
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Update admin
router.put('/admins/:adminId', authenticateAdmin, requireSuperAdmin, logAdminActivity('admin_updated_admin'), async (req, res) => {
  try {
    const { role, permissions, isActive } = req.body;

    const admin = await Admin.findByIdAndUpdate(
      req.params.adminId,
      { role, permissions, isActive },
      { new: true, runValidators: true }
    ).select('-password');

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found.'
      });
    }

    res.json({
      success: true,
      message: 'Admin updated successfully.',
      data: { admin }
    });
  } catch (error) {
    logError(error, {
      context: 'admin.updateAdmin',
      adminId: req.admin._id,
      targetAdminId: req.params.adminId
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Unlock admin account
router.put('/admins/:adminId/unlock', authenticateAdmin, requireSuperAdmin, logAdminActivity('admin_unlocked_account'), async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found.'
      });
    }

    await admin.unlockAccount();

    res.json({
      success: true,
      message: 'Admin account unlocked successfully.'
    });
  } catch (error) {
    logError(error, {
      context: 'admin.unlockAdmin',
      adminId: req.admin._id,
      targetAdminId: req.params.adminId
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalDonors = await User.countDocuments({ role: 'DONOR' });
    const activeRequests = await BloodRequest.countDocuments({ status: { $in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS'] } });

    res.json({
      totalUsers,
      totalDonors,
      activeRequests
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
  }
});

module.exports = router; 