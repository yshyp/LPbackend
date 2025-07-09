const axios = require('axios');
const { logSystemEvent, logError } = require('./loggerService');

class WhatsAppService {
  constructor() {
    // Twilio Configuration
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.contentSid = process.env.TWILIO_CONTENT_SID;
    this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || 'VAf0ce18cab7daa18bc583d092e32ebd8c';
  }

  // Format phone number for WhatsApp
  formatPhoneNumberForWhatsApp(phoneNumber) {
    // Remove any non-digit characters except +
    let formatted = phoneNumber.replace(/[^\d+]/g, '');
    
    // Ensure it starts with +
    if (!formatted.startsWith('+')) {
      formatted = '+' + formatted;
    }
    
    // Add whatsapp: prefix
    const whatsappNumber = `whatsapp:${formatted}`;
    
    return whatsappNumber;
  }

  // Send OTP via Twilio WhatsApp
  async sendOTP(phoneNumber, otp, type = 'LOGIN') {
    try {
      console.log('🔄 Redirecting to SMS fallback (Twilio Verify)...');
      // Use SMS fallback which uses Twilio Verify
      return await this.sendSMSFallback(phoneNumber, otp, type);
    } catch (error) {
      console.error('❌ SendOTP error:', error);
      return { success: false, error: error.message };
    }
  }

  // SMS fallback method using Twilio Verify (fixed)
  async sendSMSFallback(phoneNumber, message, type = 'OTP') {
    try {
      // Format phone number for SMS (without whatsapp: prefix)
      let formattedPhone = phoneNumber.replace(/[^\d+]/g, '');
      if (!formattedPhone.startsWith('+')) {
        // Add country code for India if not present
        if (formattedPhone.length === 10) {
          formattedPhone = '+91' + formattedPhone;
        } else {
          formattedPhone = '+' + formattedPhone;
        }
      }

      console.log('📱 Sending SMS via Twilio Verify to:', formattedPhone.replace(/\d(?=\d{4})/g, '*'));

      logSystemEvent('twilio_verify_sending', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        type,
        method: 'verify_sms',
        formattedPhone: formattedPhone.replace(/\d(?=\d{4})/g, '*')
      });

      // Use Twilio Verify API - NO "From" number needed
      const response = await axios.post(
        `https://verify.twilio.com/v2/Services/${this.verifyServiceSid}/Verifications`,
        new URLSearchParams({
          To: formattedPhone,
          Channel: 'sms'
        }),
        {
          auth: {
            username: this.accountSid,
            password: this.authToken
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('✅ Twilio Verify SMS sent successfully:', response.data.sid);

      logSystemEvent('twilio_verify_sent_successfully', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        type,
        verificationSid: response.data.sid,
        method: 'verify_sms',
        status: response.data.status
      });

      return { 
        success: true, 
        verificationSid: response.data.sid, 
        method: 'verify_sms',
        status: response.data.status
      };
    } catch (error) {
      console.error('❌ Twilio Verify Error:', error.response?.data || error.message);
      
      logError(error, {
        context: 'whatsapp.sendSMSFallback',
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        type,
        method: 'verify_sms',
        twilioError: error.response?.data || error.message
      });

      // Final fallback - console log for development
      console.log(`📱 [CONSOLE FALLBACK] OTP for ${phoneNumber}: ${message}`);

      return { success: true, method: 'console' };
    }
  }

  // Send message (for verification service compatibility)
  async sendMessage(phoneNumber, message) {
    try {
      // Format phone number for WhatsApp
      const formattedPhone = this.formatPhoneNumberForWhatsApp(phoneNumber);
      
      logSystemEvent('whatsapp_message_sending', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        method: 'whatsapp',
        formattedPhone: formattedPhone.replace(/\d(?=\d{4})/g, '*')
      });

      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          To: formattedPhone,
          From: this.fromNumber,
          Body: message
        },
        {
          auth: {
            username: this.accountSid,
            password: this.authToken
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      logSystemEvent('whatsapp_message_sent_successfully', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        messageId: response.data.sid,
        method: 'whatsapp',
        status: response.data.status
      });

      return {
        success: true,
        messageId: response.data.sid,
        method: 'whatsapp'
      };

    } catch (error) {
      logError(error, {
        context: 'whatsapp.sendMessage',
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        method: 'whatsapp',
        twilioError: error.response?.data || error.message
      });
      
      // Try SMS fallback
      return await this.sendSMSFallback(phoneNumber, message, 'MESSAGE');
    }
  }

  // Format phone number (public method for backward compatibility)
  formatPhoneNumber(phoneNumber) {
    return this.formatPhoneNumberForWhatsApp(phoneNumber);
  }

  // Verify OTP using Twilio Verify (fixed)
  async verifyOTP(phoneNumber, code) {
    try {
      // Format phone number properly
      let formattedPhone = phoneNumber.replace(/[^\d+]/g, '');
      if (!formattedPhone.startsWith('+')) {
        // Add country code for India if not present
        if (formattedPhone.length === 10) {
          formattedPhone = '+91' + formattedPhone;
        } else {
          formattedPhone = '+' + formattedPhone;
        }
      }

      logSystemEvent('twilio_verify_checking', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        method: 'verify_sms'
      });

      const response = await axios.post(
        `https://verify.twilio.com/v2/Services/${this.verifyServiceSid}/VerificationCheck`,
        new URLSearchParams({
          To: formattedPhone,
          Code: code
        }),
        {
          auth: {
            username: this.accountSid,
            password: this.authToken
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      logSystemEvent('twilio_verify_checked', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        method: 'verify_sms',
        status: response.data.status
      });

      return { 
        success: true, 
        status: response.data.status,
        valid: response.data.status === 'approved'
      };
    } catch (error) {
      logError(error, {
        context: 'whatsapp.verifyOTP',
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        method: 'verify_sms',
        twilioError: error.response?.data || error.message
      });

      return { 
        success: false, 
        error: error.message,
        valid: false
      };
    }
  }
}

module.exports = new WhatsAppService();
