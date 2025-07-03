const mongoose = require('mongoose');
const { logUserActivity, logError } = require('../services/loggerService');

const bloodCampSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Camp name is required'],
    trim: true,
    maxlength: [100, 'Camp name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: [true, 'Location coordinates are required'],
      validate: {
        validator: function(v) {
          return v.length === 2 && 
                 v[0] >= -180 && v[0] <= 180 && // longitude
                 v[1] >= -90 && v[1] <= 90;     // latitude
        },
        message: 'Invalid coordinates. Longitude must be between -180 and 180, latitude between -90 and 90.'
      }
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    }
  },
  date: {
    type: Date,
    required: [true, 'Camp date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    trim: true
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    trim: true
  },
  organizer: {
    name: {
      type: String,
      required: [true, 'Organizer name is required'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Organizer phone is required'],
      trim: true,
      match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
    }
  },
  capacity: {
    type: Number,
    required: [true, 'Capacity is required'],
    min: [1, 'Capacity must be at least 1']
  },
  registeredCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
    default: 'UPCOMING'
  },
  bloodGroups: {
    type: [String],
    required: [true, 'At least one blood group is required'],
    enum: {
      values: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      message: 'Invalid blood group'
    }
  },
  requirements: {
    type: [String],
    default: []
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [200, 'Notes cannot exceed 200 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create geospatial index for location-based queries
bloodCampSchema.index({ location: '2dsphere' });

// Create compound index for date and status queries
bloodCampSchema.index({ date: 1, status: 1 });

// Create index for upcoming camps
bloodCampSchema.index({ date: 1, isActive: 1 });

// Static method to find nearby camps
bloodCampSchema.statics.findNearbyCamps = async function(longitude, latitude, maxDistance = 20000) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    },
    date: { $gte: new Date() },
    isActive: true,
    status: { $in: ['UPCOMING', 'ACTIVE'] }
  }).sort({ date: 1 });
};

// Static method to find upcoming camps
bloodCampSchema.statics.findUpcomingCamps = async function(limit = 20) {
  return this.find({
    date: { $gte: new Date() },
    isActive: true,
    status: { $in: ['UPCOMING', 'ACTIVE'] }
  })
  .sort({ date: 1 })
  .limit(limit);
};

// Method to register a donor
bloodCampSchema.methods.registerDonor = async function() {
  if (this.registeredCount >= this.capacity) {
    throw new Error('Camp is at full capacity');
  }
  
  if (this.status !== 'UPCOMING' && this.status !== 'ACTIVE') {
    throw new Error('Camp is not accepting registrations');
  }
  
  this.registeredCount += 1;
  return await this.save();
};

// Method to unregister a donor
bloodCampSchema.methods.unregisterDonor = async function() {
  if (this.registeredCount > 0) {
    this.registeredCount -= 1;
    return await this.save();
  }
  return this;
};

// Pre-save middleware to update status based on date
bloodCampSchema.pre('save', function(next) {
  const now = new Date();
  
  if (this.date < now && this.status === 'UPCOMING') {
    this.status = 'ACTIVE';
  }
  
  if (this.date < now && this.status === 'ACTIVE') {
    this.status = 'COMPLETED';
  }
  
  next();
});

module.exports = mongoose.model('BloodCamp', bloodCampSchema); 