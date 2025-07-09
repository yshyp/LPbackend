const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  otp: {
    type: String,
    required: false // Not required for Twilio Verify
  },
  verificationSid: {
    type: String,
    required: false // Twilio Verify SID
  },
  method: {
    type: String,
    enum: ['email', 'sms'],
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  attempts: {
    type: Number,
    default: 0
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// Index for automatic cleanup of expired records
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for efficient queries
verificationSchema.index({ userId: 1 });
verificationSchema.index({ verificationSid: 1 });

module.exports = mongoose.model('Verification', verificationSchema);