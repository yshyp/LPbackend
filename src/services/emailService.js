const nodemailer = require('nodemailer');
const { logSystemEvent, logError } = require('./loggerService');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  // Initialize email transporter
  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      logSystemEvent('email_service_initialized', {
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE === 'true'
      });
    } catch (error) {
      logError(error, {
        context: 'emailService.initializeTransporter'
      });
      console.warn('⚠️ Email service initialization failed. Email verification will be disabled.');
    }
  }

  // Verify transporter connection
  async verifyConnection() {
    try {
      if (!this.transporter) {
        return false;
      }
      await this.transporter.verify();
      return true;
    } catch (error) {
      logError(error, {
        context: 'emailService.verifyConnection'
      });
      return false;
    }
  }

  // Send email verification
  async sendVerificationEmail(email, token, name) {
    try {
      if (!this.transporter) {
        logSystemEvent('email_verification_skipped_no_transporter', {
          email: email.replace(/\w(?=\w{2})/g, '*'),
          reason: 'Email transporter not initialized'
        });
        return { success: false, error: 'Email service not configured' };
      }

      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
      
      const mailOptions = {
        from: `"LifePulse" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify Your LifePulse Account',
        html: this.getVerificationEmailTemplate(name, verificationUrl)
      };

      const result = await this.transporter.sendMail(mailOptions);

      logSystemEvent('email_verification_sent', {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        messageId: result.messageId,
        status: 'sent'
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logError(error, {
        context: 'emailService.sendVerificationEmail',
        email: email.replace(/\w(?=\w{2})/g, '*')
      });
      return { success: false, error: error.message };
    }
  }

  // Send welcome email
  async sendWelcomeEmail(email, name, role) {
    try {
      if (!this.transporter) {
        return { success: false, error: 'Email service not configured' };
      }

      const mailOptions = {
        from: `"LifePulse" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Welcome to LifePulse!',
        html: this.getWelcomeEmailTemplate(name, role)
      };

      const result = await this.transporter.sendMail(mailOptions);

      logSystemEvent('welcome_email_sent', {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        role,
        messageId: result.messageId
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logError(error, {
        context: 'emailService.sendWelcomeEmail',
        email: email.replace(/\w(?=\w{2})/g, '*')
      });
      return { success: false, error: error.message };
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(email, token, name) {
    try {
      if (!this.transporter) {
        return { success: false, error: 'Email service not configured' };
      }

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
      
      const mailOptions = {
        from: `"LifePulse" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Reset Your LifePulse Password',
        html: this.getPasswordResetTemplate(name, resetUrl)
      };

      const result = await this.transporter.sendMail(mailOptions);

      logSystemEvent('password_reset_email_sent', {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        messageId: result.messageId
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logError(error, {
        context: 'emailService.sendPasswordResetEmail',
        email: email.replace(/\w(?=\w{2})/g, '*')
      });
      return { success: false, error: error.message };
    }
  }

  // Send blood request notification email
  async sendBloodRequestNotification(email, name, requestDetails) {
    try {
      if (!this.transporter) {
        return { success: false, error: 'Email service not configured' };
      }

      const mailOptions = {
        from: `"LifePulse" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `New Blood Request - ${requestDetails.bloodGroup} Needed`,
        html: this.getBloodRequestNotificationTemplate(name, requestDetails)
      };

      const result = await this.transporter.sendMail(mailOptions);

      logSystemEvent('blood_request_email_sent', {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        requestId: requestDetails.requestId,
        bloodGroup: requestDetails.bloodGroup,
        messageId: result.messageId
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logError(error, {
        context: 'emailService.sendBloodRequestNotification',
        email: email.replace(/\w(?=\w{2})/g, '*'),
        requestId: requestDetails.requestId
      });
      return { success: false, error: error.message };
    }
  }

  // Send generic email
  async sendEmail(email, subject, htmlContent) {
    try {
      if (!this.transporter) {
        logSystemEvent('email_send_skipped_no_transporter', {
          email: email.replace(/\w(?=\w{2})/g, '*'),
          reason: 'Email transporter not initialized'
        });
        return { success: false, error: 'Email service not configured' };
      }

      const mailOptions = {
        from: `"LifePulse" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: subject,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);

      logSystemEvent('email_sent', {
        email: email.replace(/\w(?=\w{2})/g, '*'),
        subject: subject,
        messageId: result.messageId,
        status: 'sent'
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logError(error, {
        context: 'emailService.sendEmail',
        email: email.replace(/\w(?=\w{2})/g, '*'),
        subject: subject
      });
      return { success: false, error: error.message };
    }
  }

  // Email templates
  getVerificationEmailTemplate(name, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Verify Your LifePulse Account</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #e74c3c; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background: #e74c3c; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🩸 LifePulse</h1>
            <p>Blood Donation Platform</p>
          </div>
          <div class="content">
            <h2>Hello ${name}!</h2>
            <p>Thank you for joining LifePulse! To complete your registration, please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
            <p>This verification link will expire in 24 hours.</p>
            <p>If you didn't create a LifePulse account, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2024 LifePulse. All rights reserved.</p>
            <p>This email was sent to verify your account registration.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getWelcomeEmailTemplate(name, role) {
    const roleText = role === 'DONOR' ? 'donor' : 'requester';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to LifePulse!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #e74c3c; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🩸 LifePulse</h1>
            <p>Welcome to the Blood Donation Community!</p>
          </div>
          <div class="content">
            <h2>Welcome ${name}!</h2>
            <p>Your LifePulse account has been successfully verified! 🎉</p>
            <p>You're now registered as a <strong>${roleText}</strong> and can start using LifePulse to help save lives.</p>
            <h3>What you can do next:</h3>
            <ul>
              ${role === 'DONOR' ? 
                '<li>Update your availability status</li><li>Set your location to receive nearby blood requests</li><li>View and accept blood donation requests</li>' :
                '<li>Create blood requests when needed</li><li>Find nearby donors</li><li>Track your request status</li>'
              }
            </ul>
            <p>Thank you for being part of our mission to connect blood donors with those in need!</p>
          </div>
          <div class="footer">
            <p>© 2024 LifePulse. All rights reserved.</p>
            <p>Together, we can save more lives.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getPasswordResetTemplate(name, resetUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your LifePulse Password</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #e74c3c; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background: #e74c3c; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🩸 LifePulse</h1>
            <p>Password Reset Request</p>
          </div>
          <div class="content">
            <h2>Hello ${name}!</h2>
            <p>We received a request to reset your LifePulse password. Click the button below to create a new password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p>This reset link will expire in 1 hour for security reasons.</p>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2024 LifePulse. All rights reserved.</p>
            <p>This email was sent for password reset purposes.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getBloodRequestNotificationTemplate(name, requestDetails) {
    const urgencyEmoji = {
      'LOW': '🟢',
      'MEDIUM': '🟡',
      'HIGH': '🟠',
      'CRITICAL': '🔴'
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Blood Request - ${requestDetails.bloodGroup}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #e74c3c; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .urgency { padding: 10px; margin: 10px 0; border-radius: 5px; }
          .critical { background: #ffebee; border-left: 4px solid #f44336; }
          .high { background: #fff3e0; border-left: 4px solid #ff9800; }
          .medium { background: #fff8e1; border-left: 4px solid #ffc107; }
          .low { background: #e8f5e8; border-left: 4px solid #4caf50; }
          .button { display: inline-block; padding: 12px 24px; background: #e74c3c; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🩸 LifePulse</h1>
            <p>New Blood Request Nearby</p>
          </div>
          <div class="content">
            <h2>Hello ${name}!</h2>
            <p>A new blood request has been created near your location that matches your blood type.</p>
            
            <div class="urgency ${requestDetails.urgency.toLowerCase()}">
              <h3>${urgencyEmoji[requestDetails.urgency]} ${requestDetails.bloodGroup} Blood Needed</h3>
              <p><strong>Urgency:</strong> ${requestDetails.urgency}</p>
              <p><strong>Units Needed:</strong> ${requestDetails.units}</p>
              <p><strong>Hospital:</strong> ${requestDetails.hospitalName}</p>
              <p><strong>Required By:</strong> ${new Date(requestDetails.requiredBy).toLocaleDateString()}</p>
            </div>

            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/requests/${requestDetails.requestId}" class="button">View Request Details</a>
            </p>

            <p>If you're available to donate, please respond to this request through the LifePulse app.</p>
            <p>Thank you for your willingness to help save lives!</p>
          </div>
          <div class="footer">
            <p>© 2024 LifePulse. All rights reserved.</p>
            <p>This email was sent because you're a registered donor in the area.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new EmailService(); 