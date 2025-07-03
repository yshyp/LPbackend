const mongoose = require('mongoose');
const crypto = require('crypto');
const { logSystemEvent, logError, logUserActivity } = require('../services/loggerService');

const emailVerificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['EMAIL_VERIFICATION', 'PASSWORD_RESET', 'LOGIN'],
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedAt: {
    type: Date
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  lastAttemptAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for cleanup queries
emailVerificationSchema.index({ expiresAt: 1, isUsed: 1 });
emailVerificationSchema.index({ userId: 1, type: 1, isUsed: 1 });

// Pre-save middleware for logging
emailVerificationSchema.pre('save', function(next) {
  try {
    if (this.isNew) {
      logSystemEvent('email_verification_created', {
        userId: this.userId,
        email: this.email.replace(/\w(?=\w{2})/g, '*'),
        type: this.type,
        expiresAt: this.expiresAt,
        ipAddress: this.ipAddress,
        userAgent: this.userAgent
      });
    } else if (this.isModified('isUsed') && this.isUsed) {
      logSystemEvent('email_verification_used', {
        userId: this.userId,
        email: this.email.replace(/\w(?=\w{2})/g, '*'),
        type: this.type,
        usedAt: this.usedAt,
        ipAddress: this.ipAddress
      });
    }
    next();
  } catch (error) {
    logError(error, {
      context: 'emailVerificationSchema.pre.save',
      userId: this.userId
    });
    next();
  }
});

// Static method to create verification token
emailVerificationSchema.statics.createVerification = async function(userId, email, type, ipAddress, userAgent) {
  try {
    // Invalidate any existing tokens for this user and type
    if (userId) {
      await this.updateMany(
        { userId, type, isUsed: false },
        { isUsed: true, usedAt: new Date() }
      );
    } else {
      // For registration scenarios, invalidate by email
      await this.updateMany(
        { email, type, isUsed: false },
        { isUsed: true, usedAt: new Date() }
      );
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration based on type
    const expiresAt = new Date();
    if (type === 'EMAIL_VERIFICATION') {
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours
    } else if (type === 'PASSWORD_RESET') {
      expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour
    } else if (type === 'LOGIN') {
      expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes
    }

    const verification = new this({
      userId,
      email,
      token,
      type,
      expiresAt,
      ipAddress,
      userAgent
    });

    await verification.save();

    logSystemEvent('email_verification_token_generated', {
      userId,
      email: email.replace(/\w(?=\w{2})/g, '*'),
      type,
      expiresAt,
      ipAddress,
      userAgent
    });

    return verification;
  } catch (error) {
    logError(error, {
      context: 'emailVerificationSchema.statics.createVerification',
      userId,
      email: email.replace(/\w(?=\w{2})/g, '*'),
      type
    });
    throw error;
  }
};

// Static method to verify token
emailVerificationSchema.statics.verifyToken = async function(token, type, ipAddress, userAgent) {
  try {
    const verification = await this.findOne({
      token,
      type,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!verification) {
      logSystemEvent('email_verification_invalid_token', {
        token: token.substring(0, 8) + '...',
        type,
        ipAddress,
        userAgent,
        reason: 'Token not found, expired, or already used'
      });
      return { valid: false, error: 'Invalid or expired token' };
    }

    // Update attempt count
    verification.attempts += 1;
    verification.lastAttemptAt = new Date();
    await verification.save();

    logSystemEvent('email_verification_token_verified', {
      userId: verification.userId,
      email: verification.email.replace(/\w(?=\w{2})/g, '*'),
      type,
      attempts: verification.attempts,
      ipAddress,
      userAgent
    });

    return { valid: true, verification };
  } catch (error) {
    logError(error, {
      context: 'emailVerificationSchema.statics.verifyToken',
      token: token.substring(0, 8) + '...',
      type,
      ipAddress
    });
    throw error;
  }
};

// Static method to mark token as used
emailVerificationSchema.statics.markAsUsed = async function(token, type) {
  try {
    const verification = await this.findOneAndUpdate(
      { token, type, isUsed: false },
      { 
        isUsed: true, 
        usedAt: new Date() 
      },
      { new: true }
    );

    if (verification) {
      logSystemEvent('email_verification_marked_used', {
        userId: verification.userId,
        email: verification.email.replace(/\w(?=\w{2})/g, '*'),
        type,
        usedAt: verification.usedAt
      });
    }

    return verification;
  } catch (error) {
    logError(error, {
      context: 'emailVerificationSchema.statics.markAsUsed',
      token: token.substring(0, 8) + '...',
      type
    });
    throw error;
  }
};

// Static method to cleanup expired tokens
emailVerificationSchema.statics.cleanupExpired = async function() {
  try {
    const result = await this.deleteMany({
      expiresAt: { $lt: new Date() },
      isUsed: false
    });

    if (result.deletedCount > 0) {
      logSystemEvent('email_verification_cleanup', {
        deletedCount: result.deletedCount,
        action: 'expired_tokens_removed'
      });
    }

    return result.deletedCount;
  } catch (error) {
    logError(error, {
      context: 'emailVerificationSchema.statics.cleanupExpired'
    });
    throw error;
  }
};

// Static method to get verification stats
emailVerificationSchema.statics.getStats = async function() {
  try {
    const stats = await this.aggregate([
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          used: { $sum: { $cond: ['$isUsed', 1, 0] } },
          expired: { $sum: { $cond: [{ $lt: ['$expiresAt', new Date()] }, 1, 0] } },
          active: { $sum: { $cond: [{ $and: [{ $eq: ['$isUsed', false] }, { $gt: ['$expiresAt', new Date()] }] }, 1, 0] } }
        }
      }
    ]);

    logSystemEvent('email_verification_stats_retrieved', {
      stats: stats.reduce((acc, stat) => {
        acc[stat._id] = stat;
        return acc;
      }, {})
    });

    return stats;
  } catch (error) {
    logError(error, {
      context: 'emailVerificationSchema.statics.getStats'
    });
    throw error;
  }
};

// Instance method to check if token is expired
emailVerificationSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

// Instance method to check if token is valid for use
emailVerificationSchema.methods.isValid = function() {
  return !this.isUsed && !this.isExpired();
};

module.exports = mongoose.model('EmailVerification', emailVerificationSchema); 