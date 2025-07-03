const OTP = require('../models/OTP');
const EmailVerification = require('../models/EmailVerification');
const whatsappService = require('./whatsappService');
const emailService = require('./emailService');
const { logUserActivity, logError, logSystemEvent } = require('./loggerService');

class VerificationService {
  constructor() {
    // Configuration for verification method
    this.verificationMethod = process.env.VERIFICATION_METHOD || 'SMS'; // 'SMS' or 'EMAIL'
    this.otpLength = 6;
    this.expiryMinutes = 10;
  }

  // Helper function to get request context
  getRequestContext(req) {
    return {
      ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
      userAgent: req.get('User-Agent'),
      method: req.method,
      path: req.path
    };
  }

  // Generate OTP code
  generateOTP() {
    return Math.floor(Math.pow(10, this.otpLength - 1) + Math.random() * Math.pow(10, this.otpLength - 1)).toString();
  }

  // Send verification code via SMS
  async sendSMSOTP(phone, otp, type, userName = 'User') {
    try {
      const message = `Your LifePulse verification code is: ${otp}. Valid for ${this.expiryMinutes} minutes. Do not share this code with anyone.`;
      
      const result = await whatsappService.sendMessage(phone, message);
      
      logSystemEvent('sms_otp_sent', {
        phone: phone.replace(/\w(?=\w{2})/g, '*'),
        type,
        userName: userName.replace(/\w(?=\w{2})/g, '*'),
        success: result.success
      });

      return result;
    } catch (error) {
      logError(error, {
        context: 'verificationService.sendSMSOTP',
        phone: phone.replace(/\w(?=\w{2})/g, '*'),
        type
      });
      throw error;
    }
  }

  // Send verification code via Email
  async sendEmailOTP(email, otp, type, userName = 'User') {
    try {
      const subject = `LifePulse Verification Code - ${type}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">LifePulse</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Blood Donation Platform</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-bottom: 20px;">Verification Code</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              Hello ${userName},<br><br>
              Your verification code for ${type.toLowerCase().replace('_', ' ')} is:
            </p>
            
            <div style="background: #fff; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px;">${otp}</span>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              This code is valid for <strong>${this.expiryMinutes} minutes</strong>.<br>
              Do not share this code with anyone.
            </p>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>Security Notice:</strong> LifePulse will never ask for this code via phone call or text message.
              </p>
            </div>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
        </div>
      `;

      const result = await emailService.sendEmail(email, subject, htmlContent);
      
      logSystemEvent('email_otp_sent', {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        type,
        userName: userName.replace(/\w(?=\w{2})/g, '*'),
        success: result.success
      });

      return result;
    } catch (error) {
      logError(error, {
        context: 'verificationService.sendEmailOTP',
        email: email.replace(/\w(?=\w{2})/g, '*'),
        type
      });
      throw error;
    }
  }

  // Send verification code (unified method)
  async sendVerificationCode(identifier, type, userName = 'User', requestInfo = {}) {
    try {
      const otp = this.generateOTP();
      const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000);

      let sendResult;
      let verificationRecord;

      if (this.verificationMethod === 'EMAIL' || identifier.includes('@')) {
        // Send via Email
        sendResult = await this.sendEmailOTP(identifier, otp, type, userName);
        
        // Find userId for existing users (LOGIN, PASSWORD_RESET)
        let userId = null;
        if (type === 'LOGIN' || type === 'PASSWORD_RESET') {
          const User = require('../models/User');
          const user = await User.findOne({
            $or: [
              { phone: identifier },
              { email: identifier }
            ]
          });
          userId = user ? user._id : null;
        }
        
        // Create email verification record
        verificationRecord = await EmailVerification.createVerification(
          userId, // null for registration, actual userId for existing users
          identifier,
          type,
          requestInfo.ipAddress,
          requestInfo.userAgent
        );
        
        // Update the record with our OTP
        verificationRecord.token = otp;
        verificationRecord.expiresAt = expiresAt;
        await verificationRecord.save();

      } else {
        // Send via SMS
        sendResult = await this.sendSMSOTP(identifier, otp, type, userName);
        
        // Create OTP record
        verificationRecord = await OTP.createOTP(identifier, type, this.expiryMinutes, requestInfo);
      }

      if (!sendResult.success) {
        throw new Error(sendResult.error || 'Failed to send verification code');
      }

      logUserActivity('verification_code_sent', null, identifier.replace(/\w(?=\w{2})/g, '*'), {
        type,
        method: this.verificationMethod,
        userName: userName.replace(/\w(?=\w{2})/g, '*'),
        ...requestInfo
      });

      return {
        success: true,
        message: `Verification code sent successfully via ${this.verificationMethod}`,
        expiresAt,
        method: this.verificationMethod
      };

    } catch (error) {
      logError(error, {
        context: 'verificationService.sendVerificationCode',
        identifier: identifier.replace(/\w(?=\w{2})/g, '*'),
        type,
        method: this.verificationMethod
      });
      
      return {
        success: false,
        error: error.message || 'Failed to send verification code'
      };
    }
  }

  // Verify code (unified method)
  async verifyCode(identifier, code, type, requestInfo = {}) {
    try {
      let verificationResult;

      if (this.verificationMethod === 'EMAIL' || identifier.includes('@')) {
        // Verify email token
        verificationResult = await EmailVerification.verifyToken(
          code,
          type,
          requestInfo.ipAddress,
          requestInfo.userAgent
        );
      } else {
        // Verify SMS OTP
        verificationResult = await OTP.verifyOTP(identifier, code, type, requestInfo);
      }

      if (!verificationResult.valid) {
        logUserActivity('verification_failed', null, identifier.replace(/\w(?=\w{2})/g, '*'), {
          type,
          method: this.verificationMethod,
          reason: verificationResult.message || verificationResult.error,
          ...requestInfo
        });

        return {
          valid: false,
          message: verificationResult.message || verificationResult.error
        };
      }

      logUserActivity('verification_success', null, identifier.replace(/\w(?=\w{2})/g, '*'), {
        type,
        method: this.verificationMethod,
        ...requestInfo
      });

      return {
        valid: true,
        message: 'Verification successful',
        verification: verificationResult.verification || verificationResult.otpRecord
      };

    } catch (error) {
      logError(error, {
        context: 'verificationService.verifyCode',
        identifier: identifier.replace(/\w(?=\w{2})/g, '*'),
        type,
        method: this.verificationMethod
      });
      
      return {
        valid: false,
        message: 'Verification failed due to server error'
      };
    }
  }

  // Get verification method
  getVerificationMethod() {
    return this.verificationMethod;
  }

  // Set verification method
  setVerificationMethod(method) {
    if (['SMS', 'EMAIL'].includes(method.toUpperCase())) {
      this.verificationMethod = method.toUpperCase();
      return true;
    }
    return false;
  }
}

module.exports = new VerificationService(); 