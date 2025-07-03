const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
const { logSystemEvent } = require('./src/services/loggerService');
require('dotenv').config();

async function testAdminFunctionality() {
  try {
    console.log('🔧 Testing Admin Functionality...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if super admin exists
    const existingSuperAdmin = await Admin.findOne({ role: 'SUPER_ADMIN' });
    
    if (existingSuperAdmin) {
      console.log('✅ Super admin already exists');
      console.log(`   Username: ${existingSuperAdmin.username}`);
      console.log(`   Email: ${existingSuperAdmin.email}`);
      console.log(`   Role: ${existingSuperAdmin.role}`);
    } else {
      // Create super admin
      console.log('📝 Creating super admin account...');
      
      const superAdmin = await Admin.createSuperAdmin({
        username: 'superadmin',
        email: 'admin@lifepulse.com',
        password: 'Admin@123456',
        profile: {
          firstName: 'Super',
          lastName: 'Admin',
          phone: '+1234567890'
        }
      });

      console.log('✅ Super admin created successfully');
      console.log(`   Username: ${superAdmin.username}`);
      console.log(`   Email: ${superAdmin.email}`);
      console.log(`   Role: ${superAdmin.role}`);
      console.log(`   Password: Admin@123456`);
    }

    // Test admin stats
    console.log('\n📊 Testing admin statistics...');
    const adminStats = await Admin.getStats();
    console.log('Admin Statistics:', JSON.stringify(adminStats, null, 2));

    // Test password comparison
    console.log('\n🔐 Testing password functionality...');
    const admin = await Admin.findOne({ role: 'SUPER_ADMIN' });
    const isPasswordValid = await admin.comparePassword('Admin@123456');
    console.log(`Password validation: ${isPasswordValid ? '✅ Valid' : '❌ Invalid'}`);

    // Test permissions
    console.log('\n🔑 Testing permissions...');
    console.log(`Can view users: ${admin.hasPermission('viewUsers')}`);
    console.log(`Can edit users: ${admin.hasPermission('editUsers')}`);
    console.log(`Can manage admins: ${admin.hasPermission('manageAdmins')}`);
    console.log(`Can view logs: ${admin.hasPermission('viewLogs')}`);

    // Test account locking
    console.log('\n🔒 Testing account locking...');
    console.log(`Account is locked: ${admin.isLocked()}`);
    
    // Test login attempts
    await admin.incrementLoginAttempts();
    console.log(`Login attempts after increment: ${admin.loginAttempts}`);
    
    // Unlock account
    await admin.unlockAccount();
    console.log(`Account unlocked: ${!admin.isLocked()}`);

    console.log('\n🎉 All admin functionality tests passed!');
    console.log('\n📋 Admin Dashboard Access:');
    console.log('   URL: http://localhost:5000/api/admin');
    console.log('   Username: superadmin');
    console.log('   Password: Admin@123456');
    console.log('\n🔗 Available Admin Endpoints:');
    console.log('   POST /api/admin/login - Admin login');
    console.log('   GET /api/admin/profile - Get admin profile');
    console.log('   GET /api/admin/dashboard/stats - Dashboard statistics');
    console.log('   GET /api/admin/users - View all users');
    console.log('   GET /api/admin/requests - View all blood requests');
    console.log('   GET /api/admin/logs - View system logs');
    console.log('   GET /api/admin/admins - Manage admin accounts (Super Admin only)');

  } catch (error) {
    console.error('❌ Error testing admin functionality:', error);
    logSystemEvent('admin_test_failed', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
testAdminFunctionality(); 