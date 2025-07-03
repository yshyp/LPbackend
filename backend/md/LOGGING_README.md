# LifePulse Backend - Logging & OTP System

## Overview

This document describes the comprehensive logging system and enhanced OTP functionality implemented in the LifePulse backend.

## Logging System

### Features

- **Structured Logging**: All logs are in JSON format for easy parsing and analysis
- **Log Rotation**: Automatic daily rotation with compression and retention policies
- **Multiple Log Files**: Separate files for different types of logs
- **Security**: Phone numbers are masked in logs for privacy
- **Performance**: Asynchronous logging with minimal impact on application performance

### Log Files

The logging system creates the following log files in the `./logs/` directory:

1. **`error-YYYY-MM-DD.log`**: All error-level logs
   - Retention: 14 days
   - Max size: 20MB per file
   - Compressed after rotation

2. **`combined-YYYY-MM-DD.log`**: All application logs
   - Retention: 14 days
   - Max size: 20MB per file
   - Compressed after rotation

3. **`otp-YYYY-MM-DD.log`**: OTP-specific logs
   - Retention: 7 days
   - Max size: 10MB per file
   - Compressed after rotation

4. **`user-activity-YYYY-MM-DD.log`**: User activity logs
   - Retention: 30 days
   - Max size: 20MB per file
   - Compressed after rotation

### Log Types

#### 1. OTP Logs
```javascript
// OTP creation
logOTP('created', phone, type, {
  otpId: 'otp_id',
  expiresAt: '2024-01-01T10:00:00Z',
  expiryMinutes: 10,
  ipAddress: '192.168.1.1'
});

// OTP verification
logOTP('verification_success', phone, type, {
  otpId: 'otp_id',
  ipAddress: '192.168.1.1'
});
```

#### 2. User Activity Logs
```javascript
// User registration
logUserActivity('registered', userId, phone, {
  role: 'DONOR',
  bloodGroup: 'A+',
  ipAddress: '192.168.1.1'
});

// User login
logUserActivity('logged_in', userId, phone, {
  role: 'DONOR',
  fcmTokenUpdated: true
});
```

#### 3. Security Logs
```javascript
// Failed login attempts
logSecurity('login_invalid_password', {
  phone: '****1234',
  userId: 'user_id',
  ipAddress: '192.168.1.1'
});
```

#### 4. System Logs
```javascript
// Server startup
logSystemEvent('server_started', {
  port: 5000,
  environment: 'development',
  nodeVersion: 'v18.0.0'
});
```

#### 5. Error Logs
```javascript
// Application errors
logError(error, {
  context: 'auth.login',
  phone: '****1234',
  ipAddress: '192.168.1.1'
});
```

## OTP System

### Enhanced Features

1. **Comprehensive Database Storage**: All OTPs are saved with expiry, IP address, and user agent
2. **Rate Limiting**: Maximum 5 OTP requests per hour per phone number
3. **Automatic Cleanup**: Expired OTPs are automatically invalidated
4. **Security Tracking**: Failed attempts and suspicious activities are logged
5. **Analytics**: OTP usage statistics and analytics

### OTP Model Schema

```javascript
{
  phone: String,           // Phone number
  otp: String,             // 6-digit OTP
  type: String,            // LOGIN, REGISTRATION, PASSWORD_RESET
  isUsed: Boolean,         // Whether OTP has been used
  expiresAt: Date,         // Expiration timestamp
  attempts: Number,        // Number of verification attempts
  sentAt: Date,           // When OTP was sent
  usedAt: Date,           // When OTP was used
  ipAddress: String,      // Client IP address
  userAgent: String       // Client user agent
}
```

### OTP API Endpoints

#### 1. Send OTP
```http
POST /api/auth/send-otp
Content-Type: application/json

{
  "phone": "+1234567890",
  "type": "LOGIN"
}
```

**Rate Limiting**: 5 requests per hour per phone number

#### 2. Verify OTP
```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "phone": "+1234567890",
  "otp": "123456",
  "type": "LOGIN",
  "fcmToken": "optional_fcm_token"
}
```

#### 3. OTP Statistics (Private)
```http
GET /api/otp/stats/+1234567890?hours=24
Authorization: Bearer <token>
```

#### 4. Recent OTPs (Private)
```http
GET /api/otp/recent/+1234567890?limit=10
Authorization: Bearer <token>
```

#### 5. OTP Analytics (Admin)
```http
GET /api/otp/analytics?days=7
Authorization: Bearer <token>
```

#### 6. Cleanup Expired OTPs (Admin)
```http
POST /api/otp/cleanup
Authorization: Bearer <token>
```

### OTP Security Features

1. **Automatic Invalidation**: New OTPs invalidate previous unused OTPs
2. **Attempt Tracking**: Failed attempts are tracked and limited
3. **IP Tracking**: Client IP addresses are logged for security
4. **TTL Index**: MongoDB TTL index automatically deletes expired OTPs
5. **Rate Limiting**: Prevents OTP spam and abuse

## Environment Variables

Add these to your `.env` file:

```env
# Logging
LOG_LEVEL=info                    # Log level (error, warn, info, debug)
NODE_ENV=development              # Environment (development, production)

# OTP Settings
OTP_EXPIRY_MINUTES=10            # OTP expiry time in minutes
OTP_MAX_ATTEMPTS=5               # Maximum verification attempts
OTP_RATE_LIMIT=5                 # Max OTPs per hour per phone
```

## Usage Examples

### 1. Viewing Logs

```bash
# View today's OTP logs
tail -f logs/otp-$(date +%Y-%m-%d).log

# View error logs
tail -f logs/error-$(date +%Y-%m-%d).log

# Search for specific phone number (masked)
grep "****1234" logs/otp-$(date +%Y-%m-%d).log
```

### 2. OTP Statistics

```javascript
// Get OTP stats for a phone number
const stats = await OTP.getStats('+1234567890', 24); // Last 24 hours

// Clean up expired OTPs
const deletedCount = await OTP.cleanupExpired();
```

### 3. Monitoring OTP Usage

```javascript
// Check rate limiting
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
const recentOTPs = await OTP.countDocuments({
  phone: '+1234567890',
  type: 'LOGIN',
  createdAt: { $gte: oneHourAgo }
});
```

## Security Considerations

1. **Phone Number Masking**: All phone numbers in logs are masked (e.g., `****1234`)
2. **No OTP Storage**: Actual OTP values are not logged for security
3. **IP Tracking**: Client IPs are logged for security monitoring
4. **Rate Limiting**: Prevents abuse and spam
5. **Automatic Cleanup**: Expired OTPs are automatically removed

## Monitoring and Alerts

### Key Metrics to Monitor

1. **OTP Success Rate**: Track successful vs failed verifications
2. **Rate Limit Violations**: Monitor for potential abuse
3. **Failed Attempts**: Track suspicious activity patterns
4. **System Errors**: Monitor application errors and exceptions

### Example Alerts

```javascript
// Alert on high failure rate
if (failureRate > 0.3) {
  // Send alert to admin
}

// Alert on rate limit violations
if (rateLimitViolations > 10) {
  // Send security alert
}
```

## Troubleshooting

### Common Issues

1. **Log Directory Not Created**: Ensure the application has write permissions
2. **OTP Not Sending**: Check WhatsApp/Twilio configuration
3. **High Memory Usage**: Check log rotation settings
4. **Database Performance**: Monitor OTP collection size and indexes

### Debug Commands

```bash
# Check log file sizes
du -h logs/

# View recent errors
tail -n 100 logs/error-$(date +%Y-%m-%d).log

# Check OTP collection size
mongo --eval "db.otps.stats()"
```

## Best Practices

1. **Regular Monitoring**: Check logs daily for anomalies
2. **Backup Logs**: Implement log backup strategy
3. **Security Review**: Regularly review security logs
4. **Performance Tuning**: Monitor and adjust log rotation settings
5. **Compliance**: Ensure logging meets data protection requirements

## API Documentation

For complete API documentation, see the main README.md file or run the server and visit `/health` endpoint for basic information. 