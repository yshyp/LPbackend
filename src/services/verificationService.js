const OTP = require('../models/OTP');
const EmailVerification = require('../models/EmailVerification');
const Verification = require('../models/Verification');
const User = require('../models/User'); // Add this line
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
    console.log('🚀 SendVerificationCode called:', {
      identifier: identifier.replace(/\w(?=\w{2})/g, '*'),
      type,
      userName,
      method: this.verificationMethod,
      timestamp: new Date().toISOString()
    });

    try {
      // If this is SMS and for registration, use the new Twilio Verify method
      if (this.verificationMethod === 'SMS' && !identifier.includes('@')) {
        console.log('📱 Using Twilio Verify for SMS:', {
          identifier: identifier.replace(/\w(?=\w{2})/g, '*'),
          type
        });
        
        try {
          // Use Twilio Verify - it generates its own OTP
          console.log('📤 Calling whatsappService.sendSMSFallback...');
          const result = await whatsappService.sendSMSFallback(identifier, '', type);
          console.log('📤 WhatsApp service result:', result);
          
          if (!result.success) {
            console.log('❌ SMS sending failed:', result.error);
            throw new Error(`SMS sending failed: ${result.error}`);
          }

          // Store verification record in OTP collection for now (temporary solution)
          console.log('💾 Storing verification record in database...');
          try {
            const otpRecord = await OTP.create({
              phone: identifier,
              type: type,
              code: 'TWILIO_VERIFY', // Placeholder since Twilio manages the actual code
              verificationSid: result.verificationSid,
              expiresAt: new Date(Date.now() + this.expiryMinutes * 60 * 1000),
              verified: false,
              attempts: 0,
              ipAddress: requestInfo.ipAddress || 'unknown',
              userAgent: requestInfo.userAgent || 'unknown'
            });
            console.log('✅ Verification record saved:', otpRecord._id);
          } catch (dbError) {
            console.error('❌ Failed to save verification record:', dbError);
            console.error('DB Error stack:', dbError.stack);
            // Continue anyway since SMS was sent successfully
          }
          
          logUserActivity('verification_code_sent', null, identifier.replace(/\w(?=\w{2})/g, '*'), {
            type,
            method: 'SMS',
            userName: userName.replace(/\w(?=\w{2})/g, '*'),
            ...requestInfo
          });
          
          const successResult = {
            success: true,
            message: `Verification code sent successfully via SMS`,
            expiresAt: new Date(Date.now() + this.expiryMinutes * 60 * 1000),
            method: 'SMS',
            verificationSid: result.verificationSid
          };
          
          console.log('✅ SMS verification process completed successfully:', successResult);
          return successResult;
          
        } catch (smsError) {
          console.error('❌ SMS verification process error:', smsError);
          console.error('SMS Error stack:', smsError.stack);
          throw smsError;
        }
      }
      
      // Original email logic
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
        // Send via SMS (old method - fallback)
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
      console.error('❌ Send verification error:', error);
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

      if (this.verificationMethod === 'SMS' && !identifier.includes('@')) {
        // For Twilio Verify SMS
        const result = await whatsappService.verifyOTP(identifier, code);
        
        if (!result.success || !result.valid) {
          return {
            valid: false,
            message: 'Invalid verification code'
          };
        }
        
        // Find and update the OTP record
        const otpRecord = await OTP.findOne({
          phone: identifier,
          type: type
        }).sort({ createdAt: -1 });
        
        if (otpRecord) {
          otpRecord.verified = true;
          await otpRecord.save();
        }
        
        verificationResult = {
          valid: true,
          otpRecord: otpRecord
        };
      } else if (this.verificationMethod === 'EMAIL' || identifier.includes('@')) {
        // Verify email token
        verificationResult = await EmailVerification.verifyToken(
          code,
          type,
          requestInfo.ipAddress,
          requestInfo.userAgent
        );
      } else {
        // Verify SMS OTP (old method)
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
      console.error('❌ Verify code error:', error);
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

  // Send verification (updated method)
  async sendVerification(user, method = 'sms') {
    try {
      if (method === 'sms') {
        console.log(`📱 Sending SMS verification to ${user.phone}`);
        
        // Use Twilio Verify - it generates its own OTP
        const result = await whatsappService.sendSMSFallback(user.phone, '', 'REGISTRATION');
        
        if (!result.success) {
          throw new Error(`SMS sending failed: ${result.error}`);
        }
        
        // Store verification record (without OTP since Twilio manages it)
        await Verification.findOneAndUpdate(
          { userId: user._id },
          {
            userId: user._id,
            method: 'sms',
            verificationSid: result.verificationSid, // Store Twilio's verification SID
            verified: false,
            attempts: 0,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
          },
          { upsert: true, new: true }
        );
        
        return { success: true, method: 'sms', message: 'OTP sent via SMS' };
      }
      
      // Email verification (existing logic)
      if (method === 'email') {
        const otp = this.generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        await Verification.findOneAndUpdate(
          { userId: user._id },
          {
            userId: user._id,
            otp,
            expiresAt,
            method: 'email',
            verified: false,
            attempts: 0
          },
          { upsert: true, new: true }
        );
        
        await this.sendEmailOTP(user.email, otp, 'REGISTRATION', user.name);
        return { success: true, method: 'email', message: 'OTP sent via email' };
      }
      
    } catch (error) {
      console.error('Verification sending error:', error);
      throw error;
    }
  }

  // Verify OTP (updated method)
  async verifyOTP(userId, otp, method = 'sms') {
    try {
      const verification = await Verification.findOne({ userId });
      
      if (!verification) {
        throw new Error('No verification found');
      }
      
      if (verification.expiresAt < new Date()) {
        throw new Error('OTP has expired');
      }
      
      if (method === 'sms') {
        // Use Twilio Verify to check the OTP
        const user = await User.findById(userId);
        const result = await whatsappService.verifyOTP(user.phone, otp);
        
        if (!result.success || !result.valid) {
          verification.attempts += 1;
          await verification.save();
          throw new Error('Invalid OTP');
        }
        
        // Mark as verified
        verification.verified = true;
        await verification.save();
        
        return { success: true, message: 'SMS verification successful' };
      }
      
      // Email verification (existing logic)
      if (method === 'email') {
        if (verification.otp !== otp) {
          verification.attempts += 1;
          await verification.save();
          throw new Error('Invalid OTP');
        }
        
        verification.verified = true;
        await verification.save();
        
        return { success: true, message: 'Email verification successful' };
      }
      
    } catch (error) {
      console.error('OTP verification error:', error);
      throw error;
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