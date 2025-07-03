# LifePulse Unified Verification System

## Overview

The LifePulse application now includes a unified verification system that supports both **SMS OTP** and **Email OTP** for user authentication. This system provides flexibility to choose between SMS (via WhatsApp/Twilio) or Email verification based on your configuration.

## Features

### 🔐 **Unified Verification**
- **SMS OTP**: Uses WhatsApp Business API or Twilio for delivery
- **Email OTP**: Uses SMTP (Gmail) for delivery
- **Automatic Detection**: Automatically detects if identifier is email or phone number
- **Configurable**: Easy to switch between methods via environment variable

### 🛡️ **Security Features**
- 6-digit OTP codes
- 10-minute expiration
- Rate limiting (5 requests per 15 minutes for sending, 10 for verification)
- Maximum 5 verification attempts per OTP
- IP address and user agent tracking
- Comprehensive logging

### 📱 **Supported Verification Types**
- **LOGIN**: User login verification
- **REGISTRATION**: New user registration verification
- **PASSWORD_RESET**: Password reset verification

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Verification Configuration
VERIFICATION_METHOD=SMS
# Options: SMS or EMAIL
# SMS: Uses WhatsApp/Twilio for OTP delivery
# EMAIL: Uses email service for OTP delivery
```

### Verification Method Options

1. **SMS (Default)**
   - Uses WhatsApp Business API or Twilio
   - Requires WhatsApp/Twilio configuration
   - Better for mobile-first applications

2. **EMAIL**
   - Uses SMTP (Gmail) for delivery
   - Requires email service configuration
   - Better for web applications or when email is preferred

## API Endpoints

### Base URL: `/api/verification`

### 1. Send Verification Code
```http
POST /api/verification/send
```

**Request Body:**
```json
{
  "identifier": "user@example.com", // or "+1234567890"
  "type": "LOGIN", // LOGIN, REGISTRATION, or PASSWORD_RESET
  "userName": "John Doe" // optional
}
```

**Response:**
```json
{
  "message": "Verification code sent successfully via SMS",
  "method": "SMS",
  "expiresAt": "2024-01-15T10:30:00.000Z"
}
```

### 2. Verify Code
```http
POST /api/verification/verify
```

**Request Body:**
```json
{
  "identifier": "user@example.com", // or "+1234567890"
  "code": "123456",
  "type": "LOGIN"
}
```

**Response (for LOGIN):**
```json
{
  "message": "Login successful",
  "user": {
    "_id": "user_id",
    "name": "John Doe",
    "email": "user@example.com",
    "phone": "+1234567890",
    "role": "DONOR"
  },
  "token": "jwt_token_here"
}
```

### 3. Get Verification Method
```http
GET /api/verification/method
```

**Response:**
```json
{
  "method": "SMS",
  "supportedMethods": ["SMS", "EMAIL"]
}
```

### 4. Set Verification Method (Admin)
```http
POST /api/verification/method
```

**Request Body:**
```json
{
  "method": "EMAIL"
}
```

### 5. Resend Verification Code
```http
POST /api/verification/resend
```

**Request Body:**
```json
{
  "identifier": "user@example.com",
  "type": "LOGIN"
}
```

## Usage Examples

### Frontend Integration

#### React Native Example
```javascript
import apiService from '../services/apiService';

// Send verification code
const sendVerification = async (identifier, type) => {
  try {
    const response = await apiService.post('/verification/send', {
      identifier,
      type,
      userName: 'John Doe'
    });
    
    console.log('Verification sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Failed to send verification:', error);
    throw error;
  }
};

// Verify code
const verifyCode = async (identifier, code, type) => {
  try {
    const response = await apiService.post('/verification/verify', {
      identifier,
      code,
      type
    });
    
    if (type === 'LOGIN') {
      // Store token and user data
      await AsyncStorage.setItem('token', response.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response.data;
  } catch (error) {
    console.error('Verification failed:', error);
    throw error;
  }
};
```

### cURL Examples

#### Send SMS OTP
```bash
curl -X POST http://localhost:5000/api/verification/send \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+1234567890",
    "type": "LOGIN",
    "userName": "John Doe"
  }'
```

#### Send Email OTP
```bash
curl -X POST http://localhost:5000/api/verification/send \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "type": "LOGIN",
    "userName": "John Doe"
  }'
```

#### Verify Code
```bash
curl -X POST http://localhost:5000/api/verification/verify \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+1234567890",
    "code": "123456",
    "type": "LOGIN"
  }'
```

## Automatic Method Detection

The system automatically detects the verification method based on the identifier:

- **Email addresses** (containing `@`) → Email OTP
- **Phone numbers** (without `@`) → SMS OTP

This works regardless of the `VERIFICATION_METHOD` setting, providing flexibility for mixed identifier types.

## Error Handling

### Common Error Responses

```json
{
  "error": "User not found with this phone number or email"
}
```

```json
{
  "error": "Invalid or expired OTP"
}
```

```json
{
  "error": "Too many verification requests, please try again later.",
  "retryAfter": "15 minutes"
}
```

```json
{
  "error": "User already exists with this phone number or email"
}
```

## Security Considerations

### Rate Limiting
- **Sending**: 5 requests per 15 minutes per IP
- **Verification**: 10 attempts per 15 minutes per IP
- **Resend**: 5 requests per 15 minutes per IP

### OTP Security
- 6-digit numeric codes
- 10-minute expiration
- Maximum 5 verification attempts
- Automatic cleanup of expired OTPs

### Logging
- All verification attempts are logged
- Sensitive data is masked in logs
- IP addresses and user agents are tracked

## Migration from Old System

If you're migrating from the old OTP or email verification systems:

1. **Update your frontend** to use the new `/api/verification` endpoints
2. **Set the verification method** in your environment variables
3. **Test both SMS and Email** verification flows
4. **Update your documentation** to reflect the new unified system

## Troubleshooting

### SMS Not Working
1. Check WhatsApp/Twilio configuration
2. Verify phone number format (should include country code)
3. Check rate limits and quotas

### Email Not Working
1. Check SMTP configuration
2. Verify email address format
3. Check spam folder
4. Ensure email service credentials are correct

### General Issues
1. Check server logs for detailed error messages
2. Verify environment variables are set correctly
3. Ensure database connection is working
4. Check rate limiting settings

## Support

For issues or questions about the verification system:

1. Check the server logs in `./logs/` directory
2. Review the environment configuration
3. Test with the provided cURL examples
4. Check the database for verification records

---

**Note**: This unified verification system replaces the separate OTP and email verification systems while maintaining backward compatibility for existing implementations. 