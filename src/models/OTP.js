const mongoose = require('mongoose');
const { logOTP, logError } = require('../services/loggerService');

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  otp: {
    type: String,
    required: [true, 'OTP is required'],
    length: 6
  },
  type: {
    type: String,
    enum: ['LOGIN', 'REGISTRATION', 'PASSWORD_RESET'],
    required: [true, 'OTP type is required']
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration time is required']
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  usedAt: {
    type: Date
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Create indexes for efficient queries
otpSchema.index({ phone: 1, type: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index to auto-delete expired OTPs
otpSchema.index({ createdAt: -1 }); // For recent OTP queries

// Method to check if OTP is valid
otpSchema.methods.isValid = function() {
  const isValid = !this.isUsed && this.attempts < 5 && new Date() < this.expiresAt;
  
  logOTP('validation_check', this.phone, this.type, {
    otpId: this._id,
    isValid,
    isUsed: this.isUsed,
    attempts: this.attempts,
    expiresAt: this.expiresAt,
    currentTime: new Date()
  });
  
  return isValid;
};

// Method to mark OTP as used
otpSchema.methods.markAsUsed = function() {
  this.isUsed = true;
  this.usedAt = new Date();
  
  logOTP('marked_used', this.phone, this.type, {
    otpId: this._id,
    usedAt: this.usedAt
  });
  
  return this.save();
};

// Method to increment attempts
otpSchema.methods.incrementAttempts = function() {
  this.attempts += 1;
  
  logOTP('attempt_incremented', this.phone, this.type, {
    otpId: this._id,
    newAttempts: this.attempts,
    maxAttempts: 5
  });
  
  return this.save();
};

// Static method to generate OTP
otpSchema.statics.generateOTP = function() {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Static method to create OTP with comprehensive logging
otpSchema.statics.createOTP = async function(phone, type, expiryMinutes = 10, requestInfo = {}) {
  try {
    const otp = this.generateOTP();
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    
    // Invalidate any existing unused OTPs for this phone and type
    await this.updateMany(
      { 
        phone, 
        type, 
        isUsed: false,
        expiresAt: { $gt: new Date() }
      },
      { 
        isUsed: true,
        $set: { 
          invalidatedAt: new Date(),
          invalidatedReason: 'New OTP generated'
        }
      }
    );
    
    // Create new OTP record
    const otpRecord = await this.create({
      phone,
      otp,
      type,
      expiresAt,
      ipAddress: requestInfo.ip,
      userAgent: requestInfo.userAgent
    });
    
    logOTP('created', phone, type, {
      otpId: otpRecord._id,
      expiresAt: otpRecord.expiresAt,
      expiryMinutes,
      ipAddress: requestInfo.ip,
      userAgent: requestInfo.userAgent ? requestInfo.userAgent.substring(0, 100) : undefined
    });
    
    return otpRecord;
  } catch (error) {
    logError(error, {
      context: 'OTP.createOTP',
      phone,
      type,
      expiryMinutes
    });
    throw error;
  }
};

// Static method to verify OTP with enhanced logging
otpSchema.statics.verifyOTP = async function(phone, otp, type, requestInfo = {}) {
  try {
    const otpRecord = await this.findOne({
      phone,
      type,
      isUsed: false,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 }
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      logOTP('verification_failed_no_record', phone, type, {
        reason: 'No valid OTP record found',
        ipAddress: requestInfo.ip
      });
      return { valid: false, message: 'Invalid or expired OTP' };
    }

    if (otpRecord.otp !== otp) {
      await otpRecord.incrementAttempts();
      
      logOTP('verification_failed_wrong_otp', phone, type, {
        otpId: otpRecord._id,
        attempts: otpRecord.attempts,
        ipAddress: requestInfo.ip
      });
      
      return { valid: false, message: 'Invalid OTP' };
    }

    await otpRecord.markAsUsed();
    
    logOTP('verification_success', phone, type, {
      otpId: otpRecord._id,
      ipAddress: requestInfo.ip
    });
    
    return { valid: true, otpRecord };
  } catch (error) {
    logError(error, {
      context: 'OTP.verifyOTP',
      phone,
      type
    });
    throw error;
  }
};

// Static method to get OTP statistics
otpSchema.statics.getStats = async function(phone, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    {
      $match: {
        phone,
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        used: { $sum: { $cond: ['$isUsed', 1, 0] } },
        expired: { $sum: { $cond: [{ $lt: ['$expiresAt', new Date()] }, 1, 0] } },
        totalAttempts: { $sum: '$attempts' }
      }
    }
  ]);
  
  return stats;
};

// Static method to clean up expired OTPs
otpSchema.statics.cleanupExpired = async function() {
  try {
    const result = await this.deleteMany({
      expiresAt: { $lt: new Date() },
      isUsed: false
    });
    
    if (result.deletedCount > 0) {
      logOTP('cleanup_expired', 'system', 'CLEANUP', {
        deletedCount: result.deletedCount
      });
    }
    
    return result.deletedCount;
  } catch (error) {
    logError(error, {
      context: 'OTP.cleanupExpired'
    });
    throw error;
  }
};

module.exports = mongoose.model('OTP', otpSchema); 