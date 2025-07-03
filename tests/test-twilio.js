require('dotenv').config();
const whatsappService = require('./src/services/whatsappService');

async function testTwilioWhatsApp() {
  console.log('🧪 Testing Twilio WhatsApp Integration...\n');

  const testPhone = '+919656595993';
  const testOTP = '123456';
  const testType = 'LOGIN';

  try {
    console.log(`📱 Sending OTP to: ${testPhone}`);
    console.log(`🔢 OTP: ${testOTP}`);
    console.log(`📝 Type: ${testType}\n`);

    const result = await whatsappService.sendOTP(testPhone, testOTP, testType);

    if (result.success) {
      console.log('✅ OTP sent successfully!');
      console.log(`📨 Method: ${result.method}`);
      console.log(`🆔 Message ID: ${result.messageId}`);
    } else {
      console.log('❌ Failed to send OTP');
      console.log(`📝 Error: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('📝 Twilio Error Details:', error.response.data);
    }
  }
}

// Run the test
testTwilioWhatsApp(); 