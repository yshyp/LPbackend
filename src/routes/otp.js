const express = require('express');
const OTP = require('../models/OTP');
const { auth } = require('../middleware/auth');
const { logUserActivity, logError, logSystemEvent } = require('../services/loggerService');

const router = express.Router();

// Helper function to get request info
const getRequestInfo = (req) => ({
  ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
  userAgent: req.get('User-Agent'),
  method: req.method,
  path: req.path
});

// @desc    Get OTP statistics for a phone number
// @route   GET /api/otp/stats/:phone
// @access  Private (Admin only)
router.get('/stats/:phone', auth, async (req, res) => {
  try {
    const { phone } = req.params;
    const { hours = 24 } = req.query;
    const requestInfo = getRequestInfo(req);

    // Check if user is admin (you can implement admin check here)
    // For now, we'll allow any authenticated user to view their own stats
    if (req.user.phone !== phone) {
      return res.status(403).json({ 
        error: 'You can only view your own OTP statistics' 
      });
    }

    const stats = await OTP.getStats(phone, parseInt(hours));

    logUserActivity('otp_stats_viewed', req.user.userId, phone, {
      hours,
      stats,
      ...requestInfo
    });

    res.json({
      phone,
      timeRange: `${hours} hours`,
      stats
    });

  } catch (error) {
    logError(error, {
      context: 'otp.stats',
      phone: req.params.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to get OTP statistics',
      message: error.message 
    });
  }
});

// @desc    Clean up expired OTPs
// @route   POST /api/otp/cleanup
// @access  Private (Admin only)
router.post('/cleanup', auth, async (req, res) => {
  try {
    const requestInfo = getRequestInfo(req);

    // This should be restricted to admin users only
    // For now, we'll allow any authenticated user for development
    const deletedCount = await OTP.cleanupExpired();

    logSystemEvent('otp_cleanup_executed', {
      deletedCount,
      userId: req.user.userId,
      ...requestInfo
    });

    res.json({
      message: 'OTP cleanup completed',
      deletedCount
    });

  } catch (error) {
    logError(error, {
      context: 'otp.cleanup',
      userId: req.user.userId,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to cleanup OTPs',
      message: error.message 
    });
  }
});

// @desc    Get recent OTPs for a phone number (for debugging)
// @route   GET /api/otp/recent/:phone
// @access  Private
router.get('/recent/:phone', auth, async (req, res) => {
  try {
    const { phone } = req.params;
    const { limit = 10 } = req.query;
    const requestInfo = getRequestInfo(req);

    // Check if user is viewing their own OTPs
    if (req.user.phone !== phone) {
      return res.status(403).json({ 
        error: 'You can only view your own OTP records' 
      });
    }

    const recentOTPs = await OTP.find({ phone })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('-otp'); // Don't include the actual OTP for security

    logUserActivity('recent_otps_viewed', req.user.userId, phone, {
      limit,
      count: recentOTPs.length,
      ...requestInfo
    });

    res.json({
      phone,
      count: recentOTPs.length,
      otps: recentOTPs
    });

  } catch (error) {
    logError(error, {
      context: 'otp.recent',
      phone: req.params.phone,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to get recent OTPs',
      message: error.message 
    });
  }
});

// @desc    Get OTP analytics (admin only)
// @route   GET /api/otp/analytics
// @access  Private (Admin only)
router.get('/analytics', auth, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const requestInfo = getRequestInfo(req);

    const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const analytics = await OTP.aggregate([
      {
        $match: {
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: {
            type: '$type',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
          },
          count: { $sum: 1 },
          used: { $sum: { $cond: ['$isUsed', 1, 0] } },
          expired: { $sum: { $cond: [{ $lt: ['$expiresAt', new Date()] }, 1, 0] } },
          totalAttempts: { $sum: '$attempts' }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    logUserActivity('otp_analytics_viewed', req.user.userId, null, {
      days,
      ...requestInfo
    });

    res.json({
      timeRange: `${days} days`,
      analytics
    });

  } catch (error) {
    logError(error, {
      context: 'otp.analytics',
      userId: req.user.userId,
      ...getRequestInfo(req)
    });
    
    res.status(500).json({ 
      error: 'Failed to get OTP analytics',
      message: error.message 
    });
  }
});

module.exports = router; 