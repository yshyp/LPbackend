const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { logUserActivity, logError } = require('../services/loggerService');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
  },
  phone: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  role: {
    type: String,
    enum: ['DONOR', 'REQUESTER'],
    required: [true, 'Role is required']
  },
  bloodGroup: {
    type: String,
    required: [true, 'Blood group is required'],
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  location: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number],
      required: false,
      validate: {
        validator: function(v) {
          if (!v || v.length === 0) return true; // Allow empty coordinates
          return v.length === 2 && 
                 v[0] >= -180 && v[0] <= 180 && // longitude
                 v[1] >= -90 && v[1] <= 90;     // latitude
        },
        message: 'Invalid coordinates. Longitude must be between -180 and 180, latitude between -90 and 90.'
      }
    }
  },
  fcmToken: {
    type: String,
    default: null
  },
  availability: {
    type: Boolean,
    default: false
  },
  lastDonatedAt: {
    type: Date,
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerifiedAt: {
    type: Date,
    default: null
  },
  verificationPreference: {
    type: String,
    enum: ['SMS', 'EMAIL', 'BOTH'],
    default: 'SMS'
  },
  lastVerificationMethod: {
    type: String,
    enum: ['SMS', 'EMAIL'],
    default: null
  },
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  medicalHistory: {
    hasDonatedBefore: {
      type: Boolean,
      default: false
    },
    lastDonationDate: Date,
    totalDonations: {
      type: Number,
      default: 0
    },
    medicalConditions: [String],
    medications: [String]
  },
  lastEligibilityReminderAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Create geospatial index for location-based queries (sparse - only for documents with location)
userSchema.index({ location: '2dsphere' }, { sparse: true });

// Create compound index for donor queries
userSchema.index({ role: 1, bloodGroup: 1, availability: 1 });

// Create compound index for email verification queries
userSchema.index({ email: 1, emailVerified: 1 });

// Virtual for age calculation (if we add birthDate later)
userSchema.virtual('age').get(function() {
  // This can be implemented when birthDate is added
  return null;
});

// Pre-save middleware to hash phone number (if needed for security)
userSchema.pre('save', function(next) {
  // Remove incomplete location objects (those with only type but no coordinates)
  if (this.location && (!this.location.coordinates || this.location.coordinates.length === 0)) {
    console.log('🔍 Removing incomplete location object:', this.location);
    this.location = undefined;
  }
  
  // Handle phone field to prevent duplicate key errors
  if (this.phone === null || this.phone === undefined || this.phone === '') {
    console.log('🔍 Removing null/empty phone value to prevent duplicate key error');
    this.phone = undefined; // This will remove the field entirely
  }
  
  // You could hash the phone number here if needed
  next();
});

// Method to update location
userSchema.methods.updateLocation = async function(longitude, latitude) {
  try {
    const oldLocation = this.location?.coordinates;
    
    // Initialize location if it doesn't exist
    if (!this.location) {
      this.location = {
        type: 'Point',
        coordinates: [longitude, latitude]
      };
    } else {
      this.location.coordinates = [longitude, latitude];
    }
    
    logUserActivity('location_updated', this._id, this.phone, {
      oldLocation,
      newLocation: [longitude, latitude],
      role: this.role
    });
    
    return await this.save();
  } catch (error) {
    logError(error, {
      context: 'User.updateLocation',
      userId: this._id,
      phone: this.phone,
      longitude,
      latitude
    });
    throw error;
  }
};

// Method to toggle availability
userSchema.methods.toggleAvailability = async function() {
  try {
    const oldAvailability = this.availability;
    this.availability = !this.availability;
    
    logUserActivity('availability_toggled', this._id, this.phone, {
      oldAvailability,
      newAvailability: this.availability,
      role: this.role
    });
    
    return await this.save();
  } catch (error) {
    logError(error, {
      context: 'User.toggleAvailability',
      userId: this._id,
      phone: this.phone
    });
    throw error;
  }
};

// Method to update FCM token
userSchema.methods.updateFCMToken = async function(token) {
  try {
    const oldToken = this.fcmToken;
    this.fcmToken = token;
    
    logUserActivity('fcm_token_updated', this._id, this.phone, {
      oldToken: oldToken ? 'present' : 'null',
      newToken: token ? 'present' : 'null',
      role: this.role
    });
    
    return await this.save();
  } catch (error) {
    logError(error, {
      context: 'User.updateFCMToken',
      userId: this._id,
      phone: this.phone
    });
    throw error;
  }
};

// Method to record donation
userSchema.methods.recordDonation = async function() {
  try {
    const oldTotalDonations = this.medicalHistory.totalDonations;
    const oldLastDonatedAt = this.lastDonatedAt;
    
    this.lastDonatedAt = new Date();
    this.medicalHistory.totalDonations += 1;
    this.medicalHistory.hasDonatedBefore = true;
    this.medicalHistory.lastDonationDate = new Date();
    
    logUserActivity('donation_recorded', this._id, this.phone, {
      oldTotalDonations,
      newTotalDonations: this.medicalHistory.totalDonations,
      oldLastDonatedAt,
      newLastDonatedAt: this.lastDonatedAt,
      role: this.role
    });
    
    return await this.save();
  } catch (error) {
    logError(error, {
      context: 'User.recordDonation',
      userId: this._id,
      phone: this.phone
    });
    throw error;
  }
};

// Method to verify email
userSchema.methods.verifyEmail = async function() {
  try {
    const wasEmailVerified = this.emailVerified;
    this.emailVerified = true;
    this.emailVerifiedAt = new Date();
    
    logUserActivity('email_verified', this._id, this.phone, {
      wasEmailVerified,
      emailVerifiedAt: this.emailVerifiedAt,
      email: this.email.replace(/\w(?=\w{2})/g, '*'),
      role: this.role
    });
    
    return await this.save();
  } catch (error) {
    logError(error, {
      context: 'User.verifyEmail',
      userId: this._id,
      phone: this.phone,
      email: this.email.replace(/\w(?=\w{2})/g, '*')
    });
    throw error;
  }
};

// Static method to find nearby donors
userSchema.statics.findNearbyDonors = async function(longitude, latitude, maxDistance = 20000, bloodGroup = null) {
  try {
    const query = {
      role: 'DONOR',
      availability: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: maxDistance
        }
      }
    };

    if (bloodGroup) {
      query.bloodGroup = bloodGroup;
    }

    const donors = await this.find(query).select('-fcmToken');
    
    return donors;
  } catch (error) {
    logError(error, {
      context: 'User.findNearbyDonors',
      longitude,
      latitude,
      maxDistance,
      bloodGroup
    });
    throw error;
  }
};

// Static method to find nearby requesters
userSchema.statics.findNearbyRequesters = async function(longitude, latitude, maxDistance = 20000) {
  try {
    const requesters = await this.find({
      role: 'REQUESTER',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: maxDistance
        }
      }
    }).select('-fcmToken');
    
    return requesters;
  } catch (error) {
    logError(error, {
      context: 'User.findNearbyRequesters',
      longitude,
      latitude,
      maxDistance
    });
    throw error;
  }
};

// Static method to find nearby requesters
userSchema.statics.findNearbyRequesters = function(longitude, latitude, maxDistance = 20000) {
  return this.find({
    role: 'REQUESTER',
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    }
  }).select('-fcmToken');
};

// Method to check donor eligibility (90 days rule)
userSchema.methods.isEligibleToDonate = function() {
  const lastDonation = this.medicalHistory?.lastDonationDate;
  if (!lastDonation) return { eligible: true, daysLeft: 0 };
  const now = new Date();
  const diffMs = now - lastDonation;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const daysLeft = 90 - diffDays;
  if (diffDays >= 90) {
    return { eligible: true, daysLeft: 0 };
  } else {
    return { eligible: false, daysLeft: daysLeft > 0 ? daysLeft : 0 };
  }
};

module.exports = mongoose.model('User', userSchema); 