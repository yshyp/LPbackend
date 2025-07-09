require('dotenv').config();
const whatsappService = require('./src/services/whatsappService');

async function testSMS() {
  const phone = '+919656595993'; // Replace with your test number
  const otp = '654321';
  const result = await whatsappService.sendSMSFallback(phone, otp, 'REGISTRATION');
  console.log(result);
}

testSMS(); 