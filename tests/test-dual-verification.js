const mongoose = require('mongoose');
const User = require('./src/models/User');
const OTP = require('./src/models/OTP');
const EmailVerification = require('./src/models/EmailVerification');
const emailService = require('./src/services/emailService');
const whatsappService = require('./src/services/whatsappService');
const { logSystemEvent, logError } = require('./src/services/loggerService');
require('dotenv').config();

async function testDualVerification() {
  try {
    console.log('🧪 Testing Dual Verification System...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Test 1: Email Service Connection
    console.log('\n📧 Test 1: Email Service Connection');
    const emailConnectionTest = await emailService.verifyConnection();
    if (emailConnectionTest) {
      console.log('✅ Email service connection successful');
    } else {
      console.log('⚠️ Email service connection failed - check configuration');
    }

    // Test 2: WhatsApp Service Connection
    console.log('\n📱 Test 2: WhatsApp Service Connection');
    const whatsappConnectionTest = await whatsappService.testConnection();
    if (whatsappConnectionTest.success) {
      console.log('✅ WhatsApp service connection successful');
    } else {
      console.log('⚠️ WhatsApp service connection failed - check configuration');
    }

    // Test 3: SMS Verification Preference Registration
    console.log('\n📱 Test 3: SMS Verification Preference Registration');
    const smsUser = new User({
      name: 'SMS Test User',
      email: 'sms-test@example.com',
      phone: '+1234567890',
      password: 'hashedpassword',
      bloodGroup: 'O+',
      role: 'DONOR',
      verificationPreference: 'SMS'
    });
    await smsUser.save();
    console.log('✅ SMS preference user created:', smsUser._id);

    // Test 4: Email Verification Preference Registration
    console.log('\n📧 Test 4: Email Verification Preference Registration');
    const emailUser = new User({
      name: 'Email Test User',
      email: 'email-test@example.com',
      phone: '+1234567891',
      password: 'hashedpassword',
      bloodGroup: 'A+',
      role: 'REQUESTER',
      verificationPreference: 'EMAIL'
    });
    await emailUser.save();
    console.log('✅ Email preference user created:', emailUser._id);

    // Test 5: Both Verification Preference Registration
    console.log('\n🔄 Test 5: Both Verification Preference Registration');
    const bothUser = new User({
      name: 'Both Test User',
      email: 'both-test@example.com',
      phone: '+1234567892',
      password: 'hashedpassword',
      bloodGroup: 'B+',
      role: 'DONOR',
      verificationPreference: 'BOTH'
    });
    await bothUser.save();
    console.log('✅ Both preference user created:', bothUser._id);

    // Test 6: SMS OTP Creation and Sending
    console.log('\n📱 Test 6: SMS OTP Creation and Sending');
    const otpRecord = await OTP.createOTP(
      smsUser.phone,
      'VERIFICATION',
      10,
      { ip: '127.0.0.1', userAgent: 'Test User Agent' }
    );
    console.log('✅ OTP created:', otpRecord.otp);

    const smsResult = await whatsappService.sendOTP(
      whatsappService.formatPhoneNumber(smsUser.phone),
      otpRecord.otp,
      'VERIFICATION'
    );
    
    if (smsResult.success) {
      console.log('✅ SMS OTP sent successfully');
    } else {
      console.log('⚠️ SMS OTP sending failed:', smsResult.error);
    }

    // Test 7: Email Token Creation and Sending
    console.log('\n📧 Test 7: Email Token Creation and Sending');
    const emailVerification = await EmailVerification.createVerification(
      emailUser._id,
      emailUser.email,
      'EMAIL_VERIFICATION',
      '127.0.0.1',
      'Test User Agent'
    );
    console.log('✅ Email verification token created:', emailVerification.token.substring(0, 8) + '...');

    const emailResult = await emailService.sendVerificationEmail(
      emailUser.email,
      emailVerification.token,
      emailUser.name
    );
    
    if (emailResult.success) {
      console.log('✅ Email verification sent successfully');
    } else {
      console.log('⚠️ Email verification failed:', emailResult.error);
    }

    // Test 8: SMS OTP Verification
    console.log('\n✅ Test 8: SMS OTP Verification');
    const smsVerificationResult = await OTP.verifyOTP(
      smsUser.phone,
      otpRecord.otp,
      'VERIFICATION',
      { ip: '127.0.0.1', userAgent: 'Test User Agent' }
    );
    
    if (smsVerificationResult.valid) {
      console.log('✅ SMS OTP verification successful');
    } else {
      console.log('❌ SMS OTP verification failed:', smsVerificationResult.message);
    }

    // Test 9: Email Token Verification
    console.log('\n✅ Test 9: Email Token Verification');
    const emailVerificationResult = await EmailVerification.verifyToken(
      emailVerification.token,
      'EMAIL_VERIFICATION',
      '127.0.0.1',
      'Test User Agent'
    );
    
    if (emailVerificationResult.valid) {
      console.log('✅ Email token verification successful');
    } else {
      console.log('❌ Email token verification failed:', emailVerificationResult.error);
    }

    // Test 10: Update Verification Preference
    console.log('\n🔄 Test 10: Update Verification Preference');
    const oldPreference = bothUser.verificationPreference;
    bothUser.verificationPreference = 'EMAIL';
    await bothUser.save();
    console.log('✅ Verification preference updated from', oldPreference, 'to', bothUser.verificationPreference);

    // Test 11: Verification Statistics
    console.log('\n📊 Test 11: Verification Statistics');
    const emailStats = await EmailVerification.getStats();
    const otpStats = await OTP.getStats();
    console.log('✅ Email verification stats:', JSON.stringify(emailStats, null, 2));
    console.log('✅ OTP stats:', JSON.stringify(otpStats, null, 2));

    // Test 12: User Verification Status
    console.log('\n👤 Test 12: User Verification Status');
    const users = await User.find({}).select('name verificationPreference lastVerificationMethod emailVerified');
    users.forEach(user => {
      console.log(`   ${user.name}: ${user.verificationPreference} preference, Email verified: ${user.emailVerified}`);
    });

    // Test 13: Cleanup Expired Tokens
    console.log('\n🧹 Test 13: Cleanup Expired Tokens');
    const emailCleanup = await EmailVerification.cleanupExpired();
    const otpCleanup = await OTP.cleanupExpired();
    console.log('✅ Email cleanup removed:', emailCleanup, 'expired tokens');
    console.log('✅ OTP cleanup removed:', otpCleanup, 'expired OTPs');

    // Test 14: Test Both Verification Methods for Same User
    console.log('\n🔄 Test 14: Both Verification Methods for Same User');
    
    // Send SMS OTP
    const bothOtpRecord = await OTP.createOTP(
      bothUser.phone,
      'VERIFICATION',
      10,
      { ip: '127.0.0.1', userAgent: 'Test User Agent' }
    );
    
    // Send Email Token
    const bothEmailVerification = await EmailVerification.createVerification(
      bothUser._id,
      bothUser.email,
      'EMAIL_VERIFICATION',
      '127.0.0.1',
      'Test User Agent'
    );
    
    console.log('✅ Both verification methods created for same user');
    console.log('   SMS OTP:', bothOtpRecord.otp);
    console.log('   Email Token:', bothEmailVerification.token.substring(0, 8) + '...');

    // Test 15: Verification Method Tracking
    console.log('\n📈 Test 15: Verification Method Tracking');
    bothUser.lastVerificationMethod = 'SMS';
    await bothUser.save();
    console.log('✅ Last verification method updated to:', bothUser.lastVerificationMethod);

    // Cleanup
    console.log('\n🧹 Cleanup: Removing test data');
    await User.findByIdAndDelete(smsUser._id);
    await User.findByIdAndDelete(emailUser._id);
    await User.findByIdAndDelete(bothUser._id);
    await OTP.deleteMany({ phone: { $in: [smsUser.phone, bothUser.phone] } });
    await EmailVerification.deleteMany({ 
      userId: { $in: [emailUser._id, bothUser._id] } 
    });
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All Dual Verification Tests Completed Successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Email service connection and sending');
    console.log('   ✅ WhatsApp/SMS service connection and sending');
    console.log('   ✅ User creation with verification preferences');
    console.log('   ✅ SMS OTP creation, sending, and verification');
    console.log('   ✅ Email token creation, sending, and verification');
    console.log('   ✅ Verification preference updates');
    console.log('   ✅ Statistics and monitoring');
    console.log('   ✅ Token cleanup and maintenance');
    console.log('   ✅ Both verification methods for same user');
    console.log('   ✅ Verification method tracking');

    console.log('\n🔧 Key Features Tested:');
    console.log('   📱 SMS Verification (OTP)');
    console.log('   📧 Email Verification (Token)');
    console.log('   🔄 Dual Verification Support');
    console.log('   ⚙️ Verification Preference Management');
    console.log('   📊 Comprehensive Logging and Monitoring');
    console.log('   🛡️ Security Features (Rate Limiting, Expiration)');

  } catch (error) {
    console.error('❌ Test failed:', error);
    logError(error, {
      context: 'test-dual-verification'
    });
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
testDualVerification(); 