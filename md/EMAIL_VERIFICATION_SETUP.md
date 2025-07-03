# Email Verification Setup Guide

This guide explains how to set up email verification functionality for the LifePulse application.

## Overview

The email verification system includes:
- Email verification during registration
- Password reset via email
- Welcome emails after verification
- Blood request notification emails
- Comprehensive logging and security features

## Features

### 🔐 Security Features
- Rate limiting on email verification endpoints
- Secure token generation (64-character hex)
- Token expiration (24 hours for email verification, 1 hour for password reset)
- IP and user agent tracking
- Automatic cleanup of expired tokens
- Privacy protection (email masking in logs)

### 📧 Email Types
1. **Email Verification** - Sent during registration
2. **Welcome Email** - Sent after successful verification
3. **Password Reset** - For forgotten passwords
4. **Blood Request Notifications** - For nearby donors

### 📊 Monitoring & Analytics
- Comprehensive logging of all email operations
- Email verification statistics
- Failed email tracking
- Token usage analytics

## Setup Instructions

### 1. Install Dependencies

The email verification system uses `nodemailer` for sending emails:

```bash
cd backend
npm install nodemailer
```

### 2. Email Service Configuration

#### Option A: Gmail (Recommended for Development)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
3. **Update your `.env` file**:

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-character-app-password
FRONTEND_URL=http://localhost:3000
```

#### Option B: Other SMTP Providers

For other providers (Outlook, Yahoo, custom SMTP), update the configuration:

```env
EMAIL_HOST=your-smtp-host.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@domain.com
EMAIL_PASS=your-password
FRONTEND_URL=http://localhost:3000
```

### 3. Frontend URL Configuration

Set the `FRONTEND_URL` environment variable to your frontend application URL:

```env
# For development
FRONTEND_URL=http://localhost:3000

# For production
FRONTEND_URL=https://your-app-domain.com
```

## API Endpoints

### Email Verification Routes

#### 1. Send Email Verification
```http
POST /api/email-verification/send-verification
Content-Type: application/json

{
  "email": "user@example.com",
  "type": "EMAIL_VERIFICATION"
}
```

#### 2. Verify Email Token
```http
POST /api/email-verification/verify-token
Content-Type: application/json

{
  "token": "64-character-verification-token",
  "type": "EMAIL_VERIFICATION"
}
```

#### 3. Resend Verification Email
```http
POST /api/email-verification/resend-verification
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### 4. Check Verification Status
```http
GET /api/email-verification/status/user@example.com
```

### Password Reset Routes

#### 1. Request Password Reset
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### 2. Reset Password
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "64-character-reset-token",
  "password": "new-password"
}
```

### Admin Routes

#### 1. Get Verification Statistics
```http
GET /api/email-verification/stats
```

#### 2. Test Email Service
```http
POST /api/email-verification/test-email
Content-Type: application/json

{
  "email": "test@example.com"
}
```

## Database Schema

### EmailVerification Model

```javascript
{
  userId: ObjectId,        // Reference to User
  email: String,           // Email address
  token: String,           // 64-character hex token
  type: String,            // 'EMAIL_VERIFICATION' or 'PASSWORD_RESET'
  expiresAt: Date,         // Token expiration
  isUsed: Boolean,         // Whether token has been used
  usedAt: Date,            // When token was used
  ipAddress: String,       // IP address of request
  userAgent: String,       // User agent of request
  attempts: Number,        // Number of verification attempts
  lastAttemptAt: Date      // Last attempt timestamp
}
```

### User Model Updates

The User model now includes:
```javascript
{
  email: String,           // Email address (required, unique)
  emailVerified: Boolean,  // Email verification status
  emailVerifiedAt: Date    // When email was verified
}
```

## Email Templates

### 1. Email Verification Template
- Professional design with LifePulse branding
- Clear call-to-action button
- Fallback link for manual verification
- 24-hour expiration notice

### 2. Welcome Email Template
- Personalized welcome message
- Role-specific information (Donor/Requester)
- Next steps guidance
- Branded design

### 3. Password Reset Template
- Secure reset link
- 1-hour expiration notice
- Clear instructions
- Security warnings

### 4. Blood Request Notification Template
- Urgency indicators with color coding
- Request details (blood group, units, hospital)
- Direct action button
- Location-based targeting

## Security Considerations

### Rate Limiting
- **Email Verification**: 5 requests per 15 minutes per IP
- **Token Verification**: 10 attempts per 15 minutes per IP
- **Password Reset**: Same as email verification

### Token Security
- 64-character random hex tokens
- Single-use tokens (marked as used after verification)
- Automatic expiration
- IP and user agent tracking

### Privacy Protection
- Email addresses masked in logs (e.g., `u***@e***.com`)
- Tokens truncated in logs (first 8 characters only)
- No sensitive data in error messages

## Testing

### 1. Test Email Service
```bash
curl -X POST http://localhost:5000/api/email-verification/test-email \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

### 2. Test Registration Flow
1. Register a new user
2. Check email for verification link
3. Click verification link
4. Verify user status in database

### 3. Test Password Reset Flow
1. Request password reset
2. Check email for reset link
3. Use reset link to change password
4. Verify password change

## Monitoring

### Log Files
Email verification activities are logged in:
- `logs/combined.log` - All activities
- `logs/error.log` - Error tracking
- `logs/user-activity.log` - User actions

### Key Log Events
- `email_verification_created` - Token generated
- `email_verification_sent` - Email sent successfully
- `email_verification_completed` - Email verified
- `email_verification_failed` - Failed attempts
- `password_reset_requested` - Reset requested
- `password_reset_completed` - Password changed

### Statistics Endpoint
Monitor email verification metrics:
```bash
curl http://localhost:5000/api/email-verification/stats
```

## Troubleshooting

### Common Issues

#### 1. Email Not Sending
- Check SMTP credentials
- Verify app password (Gmail)
- Check firewall/network settings
- Review email service logs

#### 2. Tokens Not Working
- Check token expiration
- Verify token format (64 characters)
- Check if token already used
- Review rate limiting

#### 3. Frontend Integration Issues
- Verify `FRONTEND_URL` configuration
- Check CORS settings
- Ensure proper error handling

### Debug Commands

#### Test Email Connection
```bash
curl -X POST http://localhost:5000/api/email-verification/test-email \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com"}'
```

#### Check Verification Stats
```bash
curl http://localhost:5000/api/email-verification/stats
```

#### View Recent Logs
```bash
tail -f logs/combined.log | grep email
```

## Production Deployment

### Environment Variables
Ensure all email configuration is set in production:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-production-email@gmail.com
EMAIL_PASS=your-production-app-password
FRONTEND_URL=https://your-production-domain.com
```

### Security Checklist
- [ ] Use app passwords (not regular passwords)
- [ ] Enable 2FA on email account
- [ ] Set appropriate rate limits
- [ ] Monitor email delivery rates
- [ ] Set up email bounce handling
- [ ] Configure SPF/DKIM records

### Monitoring Setup
- Set up alerts for email delivery failures
- Monitor verification success rates
- Track token usage patterns
- Set up log aggregation

## Support

For issues or questions:
1. Check the logs in `backend/logs/`
2. Test email service connectivity
3. Verify environment configuration
4. Review rate limiting settings

The email verification system is designed to be robust, secure, and user-friendly while providing comprehensive monitoring and logging capabilities. 