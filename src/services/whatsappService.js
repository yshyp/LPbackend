const axios = require('axios');
const { logSystemEvent, logError } = require('./loggerService');

class WhatsAppService {
  constructor() {
    // Twilio WhatsApp Configuration
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.contentSid = process.env.TWILIO_CONTENT_SID;
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
      // Format phone number for WhatsApp
      const formattedPhone = this.formatPhoneNumberForWhatsApp(phoneNumber);
      
      // Prepare content variables for the template (only OTP as {1})
      const contentVariables = {
        "1": otp
      };

      logSystemEvent('whatsapp_otp_sending', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'), // Mask phone
        type,
        method: 'whatsapp',
        formattedPhone: formattedPhone.replace(/\d(?=\d{4})/g, '*')
      });

      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          To: formattedPhone,
          From: this.fromNumber,
          ContentSid: this.contentSid,
          ContentVariables: JSON.stringify(contentVariables)
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

      logSystemEvent('whatsapp_otp_sent_successfully', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        type,
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
        context: 'whatsapp.sendOTP',
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        type,
        method: 'whatsapp',
        twilioError: error.response?.data || error.message
      });
      
      // Try SMS fallback
      return await this.sendSMSFallback(phoneNumber, otp, type);
    }
  }

  // SMS fallback method
  async sendSMSFallback(phoneNumber, message, type = 'OTP') {
    try {
      // Format phone number for SMS (without whatsapp: prefix)
      let formattedPhone = phoneNumber.replace(/[^\d+]/g, '');
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
      }

      // Determine message body based on type
      let messageBody;
      if (type === 'OTP' && message.includes('OTP')) {
        messageBody = message;
      } else if (type === 'MESSAGE') {
        messageBody = message;
      } else {
        messageBody = `Your LifePulse ${type} OTP is: ${message}`;
      }

      logSystemEvent('sms_fallback_sending', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        type,
        method: 'sms',
        formattedPhone: formattedPhone.replace(/\d(?=\d{4})/g, '*')
      });

      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          To: formattedPhone,
          From: process.env.TWILIO_PHONE_NUMBER || '+14155238886',
          Body: messageBody
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

      logSystemEvent('sms_sent_successfully', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        type,
        messageId: response.data.sid,
        method: 'sms',
        status: response.data.status
      });

      return { success: true, messageId: response.data.sid, method: 'sms' };
    } catch (error) {
      logError(error, {
        context: 'whatsapp.sendSMSFallback',
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        type,
        method: 'sms',
        twilioError: error.response?.data || error.message
      });

      // Final fallback - console log for development
      logSystemEvent('message_console_fallback', {
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        type,
        method: 'console',
        message: `Message for ${phoneNumber.replace(/\d(?=\d{4})/g, '*')}: ${message} (${type})`
      });

      console.log(`📱 [CONSOLE FALLBACK] Message for ${phoneNumber}: ${message}`);

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
}

module.exports = new WhatsAppService();
