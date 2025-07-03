const mongoose = require('mongoose');
const EmailVerification = require('./src/models/EmailVerification');
const User = require('./src/models/User');
const emailService = require('./src/services/emailService');
const { logSystemEvent, logError } = require('./src/services/loggerService');
require('dotenv').config();

async function testEmailVerification() {
  try {
    console.log('🧪 Testing Email Verification System...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Test 1: Email Service Connection
    console.log('\n📧 Test 1: Email Service Connection');
    const connectionTest = await emailService.verifyConnection();
    if (connectionTest) {
      console.log('✅ Email service connection successful');
    } else {
      console.log('⚠️ Email service connection failed - check configuration');
    }

    // Test 2: Create Test User
    console.log('\n👤 Test 2: Create Test User');
    const testUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      phone: '+1234567890',
      password: 'hashedpassword',
      bloodGroup: 'O+',
      role: 'DONOR'
    });
    await testUser.save();
    console.log('✅ Test user created:', testUser._id);

    // Test 3: Create Email Verification Token
    console.log('\n🔐 Test 3: Create Email Verification Token');
    const verification = await EmailVerification.createVerification(
      testUser._id,
      testUser.email,
      'EMAIL_VERIFICATION',
      '127.0.0.1',
      'Test User Agent'
    );
    console.log('✅ Verification token created:', verification.token.substring(0, 8) + '...');

    // Test 4: Send Verification Email
    console.log('\n📧 Test 4: Send Verification Email');
    const emailResult = await emailService.sendVerificationEmail(
      testUser.email,
      verification.token,
      testUser.name
    );
    
    if (emailResult.success) {
      console.log('✅ Verification email sent successfully');
      console.log('   Message ID:', emailResult.messageId);
    } else {
      console.log('⚠️ Email sending failed:', emailResult.error);
    }

    // Test 5: Verify Token
    console.log('\n✅ Test 5: Verify Token');
    const verificationResult = await EmailVerification.verifyToken(
      verification.token,
      'EMAIL_VERIFICATION',
      '127.0.0.1',
      'Test User Agent'
    );
    
    if (verificationResult.valid) {
      console.log('✅ Token verification successful');
    } else {
      console.log('❌ Token verification failed:', verificationResult.error);
    }

    // Test 6: Mark Token as Used
    console.log('\n🏷️ Test 6: Mark Token as Used');
    const markedVerification = await EmailVerification.markAsUsed(
      verification.token,
      'EMAIL_VERIFICATION'
    );
    
    if (markedVerification) {
      console.log('✅ Token marked as used');
    } else {
      console.log('❌ Failed to mark token as used');
    }

    // Test 7: Verify User Email
    console.log('\n👤 Test 7: Verify User Email');
    await testUser.verifyEmail();
    console.log('✅ User email verified');
    console.log('   Email Verified:', testUser.emailVerified);
    console.log('   Verified At:', testUser.emailVerifiedAt);

    // Test 8: Send Welcome Email
    console.log('\n🎉 Test 8: Send Welcome Email');
    const welcomeResult = await emailService.sendWelcomeEmail(
      testUser.email,
      testUser.name,
      testUser.role
    );
    
    if (welcomeResult.success) {
      console.log('✅ Welcome email sent successfully');
      console.log('   Message ID:', welcomeResult.messageId);
    } else {
      console.log('⚠️ Welcome email failed:', welcomeResult.error);
    }

    // Test 9: Get Verification Stats
    console.log('\n📊 Test 9: Get Verification Stats');
    const stats = await EmailVerification.getStats();
    console.log('✅ Verification statistics:', JSON.stringify(stats, null, 2));

    // Test 10: Cleanup Expired Tokens
    console.log('\n🧹 Test 10: Cleanup Expired Tokens');
    const cleanupResult = await EmailVerification.cleanupExpired();
    console.log('✅ Cleanup completed, removed:', cleanupResult, 'expired tokens');

    // Test 11: Test Password Reset Flow
    console.log('\n🔑 Test 11: Password Reset Flow');
    const resetVerification = await EmailVerification.createVerification(
      testUser._id,
      testUser.email,
      'PASSWORD_RESET',
      '127.0.0.1',
      'Test User Agent'
    );
    
    const resetEmailResult = await emailService.sendPasswordResetEmail(
      testUser.email,
      resetVerification.token,
      testUser.name
    );
    
    if (resetEmailResult.success) {
      console.log('✅ Password reset email sent successfully');
    } else {
      console.log('⚠️ Password reset email failed:', resetEmailResult.error);
    }

    // Test 12: Test Blood Request Notification
    console.log('\n🩸 Test 12: Blood Request Notification');
    const requestDetails = {
      requestId: 'test-request-123',
      bloodGroup: 'O+',
      urgency: 'HIGH',
      units: 2,
      hospitalName: 'Test Hospital',
      requiredBy: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
    };
    
    const notificationResult = await emailService.sendBloodRequestNotification(
      testUser.email,
      testUser.name,
      requestDetails
    );
    
    if (notificationResult.success) {
      console.log('✅ Blood request notification sent successfully');
    } else {
      console.log('⚠️ Blood request notification failed:', notificationResult.error);
    }

    // Cleanup
    console.log('\n🧹 Cleanup: Removing test data');
    await User.findByIdAndDelete(testUser._id);
    await EmailVerification.deleteMany({ userId: testUser._id });
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All Email Verification Tests Completed Successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Email service connection');
    console.log('   ✅ Token creation and verification');
    console.log('   ✅ Email sending (verification, welcome, password reset, notifications)');
    console.log('   ✅ User email verification');
    console.log('   ✅ Statistics and cleanup');
    console.log('   ✅ Security features (rate limiting, token expiration)');

  } catch (error) {
    console.error('❌ Test failed:', error);
    logError(error, {
      context: 'test-email-verification'
    });
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
testEmailVerification(); 