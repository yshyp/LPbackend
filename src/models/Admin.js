const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { logUserActivity, logError, logSecurity } = require('../services/loggerService');

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters']
  },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'],
    default: 'ADMIN'
  },
  permissions: {
    viewUsers: { type: Boolean, default: true },
    editUsers: { type: Boolean, default: false },
    deleteUsers: { type: Boolean, default: false },
    viewRequests: { type: Boolean, default: true },
    editRequests: { type: Boolean, default: false },
    deleteRequests: { type: Boolean, default: false },
    viewLogs: { type: Boolean, default: true },
    viewAnalytics: { type: Boolean, default: true },
    manageAdmins: { type: Boolean, default: false },
    systemSettings: { type: Boolean, default: false }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  lastLoginIP: {
    type: String,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockedUntil: {
    type: Date,
    default: null
  },
  profile: {
    firstName: String,
    lastName: String,
    phone: String,
    avatar: String
  },
  settings: {
    emailNotifications: { type: Boolean, default: true },
    dashboardLayout: { type: String, default: 'default' },
    timezone: { type: String, default: 'UTC' }
  }
}, {
  timestamps: true
});

// Indexes
adminSchema.index({ role: 1 });
adminSchema.index({ isActive: 1 });

// Pre-save middleware to hash password
adminSchema.pre('save', async function(next) {
  try {
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
      
      logSecurity('admin_password_changed', {
        adminId: this._id,
        username: this.username,
        email: this.email.replace(/\w(?=\w{2})/g, '*')
      });
    }
    next();
  } catch (error) {
    logError(error, {
      context: 'Admin.pre.save',
      adminId: this._id
    });
    next(error);
  }
});

// Method to compare password
adminSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    logError(error, {
      context: 'Admin.comparePassword',
      adminId: this._id
    });
    throw error;
  }
};

// Method to update login info
adminSchema.methods.updateLoginInfo = async function(ipAddress) {
  try {
    this.lastLoginAt = new Date();
    this.lastLoginIP = ipAddress;
    this.loginAttempts = 0;
    this.lockedUntil = null;
    
    logUserActivity('admin_logged_in', this._id, this.username, {
      ipAddress,
      role: this.role
    });
    
    return await this.save();
  } catch (error) {
    logError(error, {
      context: 'Admin.updateLoginInfo',
      adminId: this._id,
      ipAddress
    });
    throw error;
  }
};

// Method to increment login attempts
adminSchema.methods.incrementLoginAttempts = async function() {
  try {
    this.loginAttempts += 1;
    
    // Lock account after 5 failed attempts for 30 minutes
    if (this.loginAttempts >= 5) {
      this.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      
      logSecurity('admin_account_locked', {
        adminId: this._id,
        username: this.username,
        email: this.email.replace(/\w(?=\w{2})/g, '*'),
        loginAttempts: this.loginAttempts,
        lockedUntil: this.lockedUntil
      });
    }
    
    logSecurity('admin_login_failed', {
      adminId: this._id,
      username: this.username,
      email: this.email.replace(/\w(?=\w{2})/g, '*'),
      loginAttempts: this.loginAttempts
    });
    
    return await this.save();
  } catch (error) {
    logError(error, {
      context: 'Admin.incrementLoginAttempts',
      adminId: this._id
    });
    throw error;
  }
};

// Method to check if account is locked
adminSchema.methods.isLocked = function() {
  if (!this.lockedUntil) return false;
  return new Date() < this.lockedUntil;
};

// Method to unlock account
adminSchema.methods.unlockAccount = async function() {
  try {
    this.loginAttempts = 0;
    this.lockedUntil = null;
    
    logSecurity('admin_account_unlocked', {
      adminId: this._id,
      username: this.username,
      email: this.email.replace(/\w(?=\w{2})/g, '*')
    });
    
    return await this.save();
  } catch (error) {
    logError(error, {
      context: 'Admin.unlockAccount',
      adminId: this._id
    });
    throw error;
  }
};

// Method to check permissions
adminSchema.methods.hasPermission = function(permission) {
  return this.permissions[permission] === true;
};

// Method to get full name
adminSchema.methods.getFullName = function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.username;
};

// Static method to create super admin
adminSchema.statics.createSuperAdmin = async function(adminData) {
  try {
    const superAdmin = new this({
      ...adminData,
      role: 'SUPER_ADMIN',
      permissions: {
        viewUsers: true,
        editUsers: true,
        deleteUsers: true,
        viewRequests: true,
        editRequests: true,
        deleteRequests: true,
        viewLogs: true,
        viewAnalytics: true,
        manageAdmins: true,
        systemSettings: true
      }
    });

    await superAdmin.save();

    logSecurity('super_admin_created', {
      adminId: superAdmin._id,
      username: superAdmin.username,
      email: superAdmin.email.replace(/\w(?=\w{2})/g, '*')
    });

    return superAdmin;
  } catch (error) {
    logError(error, {
      context: 'Admin.createSuperAdmin',
      adminData: {
        username: adminData.username,
        email: adminData.email.replace(/\w(?=\w{2})/g, '*')
      }
    });
    throw error;
  }
};

// Static method to get admin stats
adminSchema.statics.getStats = async function() {
  try {
    const stats = await this.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
        }
      }
    ]);

    const totalAdmins = await this.countDocuments();
    const activeAdmins = await this.countDocuments({ isActive: true });
    const lockedAdmins = await this.countDocuments({ lockedUntil: { $gt: new Date() } });

    return {
      total: totalAdmins,
      active: activeAdmins,
      inactive: totalAdmins - activeAdmins,
      locked: lockedAdmins,
      byRole: stats
    };
  } catch (error) {
    logError(error, {
      context: 'Admin.getStats'
    });
    throw error;
  }
};

module.exports = mongoose.model('Admin', adminSchema); 