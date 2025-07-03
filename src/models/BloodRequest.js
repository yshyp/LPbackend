const mongoose = require('mongoose');
const { logUserActivity, logError, logSystemEvent } = require('../services/loggerService');

const bloodRequestSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Requester is required']
  },
  bloodGroup: {
    type: String,
    required: [true, 'Blood group is required'],
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  units: {
    type: Number,
    required: [true, 'Number of units is required'],
    min: [1, 'At least 1 unit is required'],
    max: [10, 'Maximum 10 units per request']
  },
  hospitalName: {
    type: String,
    required: [true, 'Hospital name is required'],
    trim: true,
    maxlength: [100, 'Hospital name cannot exceed 100 characters']
  },
  hospitalAddress: {
    type: String,
    required: [true, 'Hospital address is required'],
    trim: true,
    maxlength: [200, 'Hospital address cannot exceed 200 characters']
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
        message: 'Invalid coordinates'
      }
    }
  },
  urgency: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM'
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
    default: 'PENDING'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  requiredBy: {
    type: Date,
    required: [true, 'Required by date is required']
  },
  acceptedDonors: [{
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    acceptedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING'
    },
    notes: String
  }],
  notifications: [{
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['SENT', 'DELIVERED', 'FAILED'],
      default: 'SENT'
    }
  }],
  tags: [String], // For additional categorization
  isAnonymous: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Create geospatial index for location-based queries
bloodRequestSchema.index({ location: '2dsphere' });

// Create indexes for common queries
bloodRequestSchema.index({ status: 1, bloodGroup: 1 });
bloodRequestSchema.index({ requester: 1, status: 1 });
bloodRequestSchema.index({ requiredBy: 1 });
bloodRequestSchema.index({ urgency: 1, status: 1 });

// Virtual for checking if request is expired
bloodRequestSchema.virtual('isExpired').get(function() {
  return new Date() > this.requiredBy;
});

// Virtual for checking if request is urgent
bloodRequestSchema.virtual('isUrgent').get(function() {
  const hoursUntilRequired = (this.requiredBy - new Date()) / (1000 * 60 * 60);
  return hoursUntilRequired <= 24; // Urgent if less than 24 hours
});

// Virtual for accepted donors count
bloodRequestSchema.virtual('acceptedCount').get(function() {
  return this.acceptedDonors.filter(donor => 
    donor.status === 'CONFIRMED' || donor.status === 'COMPLETED'
  ).length;
});

// Virtual for remaining units needed
bloodRequestSchema.virtual('remainingUnits').get(function() {
  const confirmedUnits = this.acceptedDonors
    .filter(donor => donor.status === 'CONFIRMED' || donor.status === 'COMPLETED')
    .length;
  return Math.max(0, this.units - confirmedUnits);
});

// Pre-save middleware to update status if expired
bloodRequestSchema.pre('save', function(next) {
  if (this.isExpired && this.status === 'PENDING') {
    this.status = 'EXPIRED';
    
    logSystemEvent('blood_request_expired', {
      requestId: this._id,
      requesterId: this.requester,
      bloodGroup: this.bloodGroup,
      requiredBy: this.requiredBy
    });
  }
  next();
});

// Method to accept a donor
bloodRequestSchema.methods.acceptDonor = async function(donorId, notes = '') {
  try {
    // Check if donor is already accepted
    const existingAcceptance = this.acceptedDonors.find(
      acceptance => acceptance.donor.toString() === donorId.toString()
    );

    if (existingAcceptance) {
      logSystemEvent('blood_request_donor_already_accepted', {
        requestId: this._id,
        donorId,
        requesterId: this.requester
      });
      throw new Error('Donor already accepted for this request');
    }

    // Check if we still need donors
    if (this.acceptedDonors.length >= this.units) {
      logSystemEvent('blood_request_no_units_needed', {
        requestId: this._id,
        donorId,
        requesterId: this.requester,
        units: this.units,
        acceptedCount: this.acceptedDonors.length
      });
      throw new Error('No more units needed for this request');
    }

    const oldStatus = this.status;
    const oldAcceptedCount = this.acceptedDonors.length;

    this.acceptedDonors.push({
      donor: donorId,
      notes: notes
    });

    // Update status based on accepted donors
    if (this.acceptedDonors.length >= this.units) {
      this.status = 'ACCEPTED';
    } else if (this.acceptedDonors.length > 0) {
      this.status = 'IN_PROGRESS';
    }

    await this.save();

    logUserActivity('blood_request_donor_accepted', donorId, null, {
      requestId: this._id,
      requesterId: this.requester,
      bloodGroup: this.bloodGroup,
      urgency: this.urgency,
      oldStatus,
      newStatus: this.status,
      oldAcceptedCount,
      newAcceptedCount: this.acceptedDonors.length,
      notes
    });

    return this;
  } catch (error) {
    logError(error, {
      context: 'BloodRequest.acceptDonor',
      requestId: this._id,
      donorId,
      requesterId: this.requester
    });
    throw error;
  }
};

// Method to update donor status
bloodRequestSchema.methods.updateDonorStatus = async function(donorId, status, notes = '') {
  try {
    const acceptance = this.acceptedDonors.find(
      acc => acc.donor.toString() === donorId.toString()
    );

    if (!acceptance) {
      logSystemEvent('blood_request_donor_not_found', {
        requestId: this._id,
        donorId,
        requesterId: this.requester
      });
      throw new Error('Donor not found in accepted donors');
    }

    const oldStatus = acceptance.status;
    const oldRequestStatus = this.status;

    acceptance.status = status;
    if (notes) {
      acceptance.notes = notes;
    }

    // Update request status based on donor statuses
    const completedDonors = this.acceptedDonors.filter(
      acc => acc.status === 'COMPLETED'
    ).length;

    if (completedDonors >= this.units) {
      this.status = 'COMPLETED';
    } else if (this.acceptedDonors.length > 0) {
      this.status = 'IN_PROGRESS';
    }

    await this.save();

    logUserActivity('blood_request_donor_status_updated', donorId, null, {
      requestId: this._id,
      requesterId: this.requester,
      oldDonorStatus: oldStatus,
      newDonorStatus: status,
      oldRequestStatus,
      newRequestStatus: this.status,
      completedDonors,
      totalUnits: this.units,
      notes
    });

    return this;
  } catch (error) {
    logError(error, {
      context: 'BloodRequest.updateDonorStatus',
      requestId: this._id,
      donorId,
      requesterId: this.requester,
      status
    });
    throw error;
  }
};

// Method to cancel request
bloodRequestSchema.methods.cancelRequest = async function() {
  try {
    if (this.status === 'COMPLETED') {
      logSystemEvent('blood_request_cancel_completed', {
        requestId: this._id,
        requesterId: this.requester,
        status: this.status
      });
      throw new Error('Cannot cancel completed request');
    }
    
    const oldStatus = this.status;
    this.status = 'CANCELLED';
    
    await this.save();

    logUserActivity('blood_request_cancelled', this.requester, null, {
      requestId: this._id,
      oldStatus,
      newStatus: this.status,
      acceptedDonorsCount: this.acceptedDonors.length,
      bloodGroup: this.bloodGroup,
      urgency: this.urgency
    });

    return this;
  } catch (error) {
    logError(error, {
      context: 'BloodRequest.cancelRequest',
      requestId: this._id,
      requesterId: this.requester
    });
    throw error;
  }
};

// Static method to find nearby requests
bloodRequestSchema.statics.findNearbyRequests = async function(longitude, latitude, maxDistance = 20000, bloodGroup = null) {
  try {
    const query = {
      status: { $in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS'] },
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

    const requests = await this.find(query)
      .populate('requester', 'name phone')
      .populate('acceptedDonors.donor', 'name phone email bloodGroup')
      .sort({ urgency: -1, createdAt: -1 });
    
    return requests;
  } catch (error) {
    logError(error, {
      context: 'BloodRequest.findNearbyRequests',
      longitude,
      latitude,
      maxDistance,
      bloodGroup
    });
    throw error;
  }
};

// Static method to find requests by requester
bloodRequestSchema.statics.findByRequester = async function(requesterId) {
  try {
    const requests = await this.find({ requester: requesterId })
      .populate('acceptedDonors.donor', 'name phone email bloodGroup')
      .sort({ createdAt: -1 });
    
    return requests;
  } catch (error) {
    logError(error, {
      context: 'BloodRequest.findByRequester',
      requesterId
    });
    throw error;
  }
};

// Static method to find requests accepted by donor
bloodRequestSchema.statics.findByDonor = async function(donorId) {
  try {
    const requests = await this.find({
      'acceptedDonors.donor': donorId
    })
      .populate('requester', 'name phone')
      .populate('acceptedDonors.donor', 'name phone email bloodGroup')
      .sort({ createdAt: -1 });
    
    return requests;
  } catch (error) {
    logError(error, {
      context: 'BloodRequest.findByDonor',
      donorId
    });
    throw error;
  }
};

module.exports = mongoose.model('BloodRequest', bloodRequestSchema); 