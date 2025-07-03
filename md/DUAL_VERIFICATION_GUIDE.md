# Dual Verification System Guide

## 🎯 Overview

The LifePulse application now supports dual verification methods: **SMS (OTP)** and **Email (Token)**. Users can choose their preferred verification method during registration and can change it later.

## ✅ Features

### 🔐 Verification Methods
- **SMS Verification**: 6-digit OTP sent via WhatsApp/SMS
- **Email Verification**: Secure token sent via email
- **Dual Verification**: Support for both methods simultaneously
- **Flexible Preference**: Users can choose and change their preferred method

### 🛡️ Security Features
- Rate limiting for both SMS and email verification
- Secure token generation (64-character hex for email)
- OTP expiration (10 minutes for SMS)
- Email token expiration (24 hours)
- IP and user agent tracking
- Comprehensive logging and monitoring

## 📱 User Experience

### Registration Flow
1. User fills registration form with verification preference
2. System sends verification code via preferred method
3. User enters verification code
4. Account is verified and activated

### Verification Preferences
- **SMS**: Default preference, uses phone number
- **EMAIL**: Uses email address for verification
- **BOTH**: Supports both methods (email preferred, SMS fallback)

## 🔧 API Endpoints

### 1. Registration with Verification Preference
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "password": "password123",
  "bloodGroup": "O+",
  "role": "DONOR",
  "verificationPreference": "SMS"
}
```

**Response:**
```json
{
  "message": "Registration successful. Please check your phone to verify your account.",
  "token": "jwt_token_here",
  "verificationMethod": "SMS",
  "verificationSent": true,
  "user": {
    "verificationPreference": "SMS",
    "lastVerificationMethod": "SMS",
    // ... other user fields
  }
}
```

### 2. Update Verification Preference
```http
PUT /api/auth/verification-preference
Authorization: Bearer <token>
Content-Type: application/json

{
  "verificationPreference": "EMAIL"
}
```

### 3. Send Verification Code
```http
POST /api/auth/send-verification
Authorization: Bearer <token>
Content-Type: application/json

{
  "method": "EMAIL"
}
```

### 4. Verify Code (Unified Endpoint)
```http
POST /api/auth/verify-code
Content-Type: application/json

{
  "method": "SMS",
  "phone": "+1234567890",
  "code": "123456"
}
```

**OR**

```http
POST /api/auth/verify-code
Content-Type: application/json

{
  "method": "EMAIL",
  "email": "john@example.com",
  "code": "64-character-token"
}
```

### 5. Traditional OTP Verification (Still Available)
```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "phone": "+1234567890",
  "otp": "123456",
  "type": "LOGIN"
}
```

### 6. Email Token Verification (Still Available)
```http
POST /api/email-verification/verify-token
Content-Type: application/json

{
  "token": "64-character-token",
  "type": "EMAIL_VERIFICATION"
}
```

## 📊 Database Schema

### User Model Updates
```javascript
{
  // ... existing fields
  verificationPreference: {
    type: String,
    enum: ['SMS', 'EMAIL', 'BOTH'],
    default: 'SMS'
  },
  lastVerificationMethod: {
    type: String,
    enum: ['SMS', 'EMAIL'],
    default: null
  }
}
```

## 🔄 Verification Flow Logic

### Registration Process
1. **User submits registration** with verification preference
2. **System checks preference**:
   - `SMS`: Send OTP via WhatsApp/SMS
   - `EMAIL`: Send verification email
   - `BOTH`: Try email first, fallback to SMS if email fails
3. **User receives verification code**
4. **User verifies using unified endpoint**
5. **Account activated** with verification method recorded

### Login Process
1. **User logs in** with phone/password
2. **System returns** verification preference and last method used
3. **Frontend can suggest** preferred verification method for future actions

### Manual Verification
1. **User requests verification** via `/send-verification`
2. **System sends code** via specified method
3. **User verifies** via `/verify-code`
4. **Verification completed** and method updated

## 🎨 Frontend Integration

### Registration Form
```javascript
const registrationForm = {
  name: "John Doe",
  email: "john@example.com",
  phone: "+1234567890",
  password: "password123",
  bloodGroup: "O+",
  role: "DONOR",
  verificationPreference: "SMS" // or "EMAIL" or "BOTH"
};
```

### Verification Preference Selection
```javascript
const verificationOptions = [
  { value: 'SMS', label: '📱 SMS (Recommended)', description: 'Receive 6-digit code via WhatsApp/SMS' },
  { value: 'EMAIL', label: '📧 Email', description: 'Receive verification link via email' },
  { value: 'BOTH', label: '🔄 Both', description: 'Email preferred, SMS as backup' }
];
```

### Verification Code Input
```javascript
const verifyCode = async (method, code, phone = null, email = null) => {
  const response = await fetch('/api/auth/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method,
      code,
      phone,
      email
    })
  });
  
  return response.json();
};
```

## 📈 Benefits

### For Users
- **Flexibility**: Choose preferred verification method
- **Reliability**: Fallback options available
- **Convenience**: Familiar verification process
- **Security**: Multiple verification options

### For System
- **Reduced Friction**: Users choose their preferred method
- **Better Success Rates**: Multiple verification channels
- **Enhanced Security**: Dual verification capabilities
- **User Analytics**: Track verification preferences

### For Developers
- **Unified API**: Single endpoint for both verification types
- **Backward Compatibility**: Existing endpoints still work
- **Comprehensive Logging**: Full audit trail
- **Easy Testing**: Both methods can be tested independently

## 🧪 Testing

### Test SMS Verification
```bash
# 1. Register with SMS preference
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+1234567890",
    "password": "password123",
    "bloodGroup": "O+",
    "role": "DONOR",
    "verificationPreference": "SMS"
  }'

# 2. Verify SMS OTP
curl -X POST http://localhost:5000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{
    "method": "SMS",
    "phone": "+1234567890",
    "code": "123456"
  }'
```

### Test Email Verification
```bash
# 1. Register with email preference
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+1234567890",
    "password": "password123",
    "bloodGroup": "O+",
    "role": "DONOR",
    "verificationPreference": "EMAIL"
  }'

# 2. Verify email token
curl -X POST http://localhost:5000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{
    "method": "EMAIL",
    "email": "test@example.com",
    "code": "64-character-token-from-email"
  }'
```

### Test Preference Update
```bash
# Update verification preference
curl -X PUT http://localhost:5000/api/auth/verification-preference \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "verificationPreference": "EMAIL"
  }'
```

## 📊 Monitoring

### Key Metrics
- Verification preference distribution
- Success rates by method
- User preference changes
- Verification completion rates

### Log Events
- `verification_preference_updated`
- `verification_sent_manual`
- `verification_completed`
- `email_verification_sent_manual`
- `sms_verification_sent_manual`

### Analytics Queries
```javascript
// Get verification preference distribution
db.users.aggregate([
  { $group: { _id: "$verificationPreference", count: { $sum: 1 } } }
]);

// Get verification success rates
db.user_activities.aggregate([
  { $match: { action: "verification_completed" } },
  { $group: { _id: "$method", count: { $sum: 1 } } }
]);
```

## 🔧 Configuration

### Environment Variables
```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
FRONTEND_URL=http://localhost:3000

# WhatsApp/SMS Configuration
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
WHATSAPP_API_KEY=your-whatsapp-key
```

## 🚀 Production Considerations

### Rate Limiting
- **SMS Verification**: 5 requests per 15 minutes per IP
- **Email Verification**: 5 requests per 15 minutes per IP
- **Token Verification**: 10 attempts per 15 minutes per IP

### Security
- Use app passwords for email (not regular passwords)
- Enable 2FA on email accounts
- Monitor verification success rates
- Set up alerts for failed verifications

### Scalability
- Consider email service provider selection
- Implement SMS provider fallbacks
- Cache verification preferences
- Optimize database queries

## 🎉 Summary

The dual verification system provides:

✅ **User Choice**: Users can select their preferred verification method
✅ **Flexibility**: Support for SMS, Email, or both methods
✅ **Reliability**: Fallback options ensure verification success
✅ **Security**: Comprehensive security features and monitoring
✅ **Compatibility**: Backward compatible with existing systems
✅ **Scalability**: Ready for production deployment

This system enhances user experience while maintaining security and providing developers with a unified, flexible verification solution. 