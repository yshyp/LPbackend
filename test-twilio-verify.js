require('dotenv').config();
const whatsappService = require('./src/services/whatsappService');

async function testTwilioVerify() {
  const phone = '+918893706307'; // Your test number
  
  console.log('🧪 Testing Twilio Verify API...');
  console.log('📱 Phone:', phone);
  console.log('🔑 Account SID:', process.env.TWILIO_ACCOUNT_SID);
  console.log('🔑 Verify Service SID:', process.env.TWILIO_VERIFY_SERVICE_SID || 'VAf0ce18cab7daa18bc583d092e32ebd8c');
  console.log('---');
  
  try {
    // Test sending verification
    console.log('📤 Sending verification...');
    const sendResult = await whatsappService.sendSMSFallback(phone, '123456', 'REGISTRATION');
    console.log('📤 Send Result:', sendResult);
    
    if (sendResult.success) {
      console.log('✅ Verification sent successfully!');
      console.log('📋 Verification SID:', sendResult.verificationSid);
      console.log('📋 Status:', sendResult.status);
      
      // Note: In real usage, you would wait for the user to enter the code
      // For testing, we'll simulate with a dummy code
      console.log('---');
      console.log('⚠️  Note: In real usage, wait for user to enter the code from SMS');
      console.log('⚠️  For testing, you can manually check the verification status in Twilio Console');
      
    } else {
      console.log('❌ Failed to send verification');
      console.log('❌ Error:', sendResult.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('❌ Full error:', error);
  }
}

testTwilioVerify(); 