# WhatsApp Business API Setup for LifePulse OTP

This guide will help you set up WhatsApp Business API to send OTP messages for user verification.

## 🚀 Quick Setup Options

### Option 1: Twilio WhatsApp (Recommended - Already Configured)

Your app is already configured to use Twilio WhatsApp! Here's what you need to do:

1. **Get Your Twilio Auth Token**
   - Go to [Twilio Console](https://console.twilio.com/)
   - Find your Auth Token (it's hidden by default, click "show" to reveal it)

2. **Update Environment Variables**
   Add to your `.env` file:
   ```env
   TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
   TWILIO_AUTH_TOKEN=your_actual_auth_token_here
   TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
   TWILIO_CONTENT_SID=your_twilio_content_sid_here
   TWILIO_PHONE_NUMBER=+1234567890
   ```

3. **Test the Integration**
   ```bash
   cd backend
   node test-twilio.js
   ```

**Current Configuration:**
- Account SID: `your_twilio_account_sid_here`
- WhatsApp Number: `whatsapp:+1234567890`
- Content SID: `your_twilio_content_sid_here`

### Option 2: WhatsApp Business API (Meta)

1. **Create a Meta Developer Account**
   - Go to [Meta for Developers](https://developers.facebook.com/)
   - Create a new app
   - Add WhatsApp Business API product

2. **Get API Credentials**
   - Get your `WHATSAPP_API_KEY` (Access Token)
   - Get your `WHATSAPP_PHONE_NUMBER_ID`
   - Set `WHATSAPP_API_URL` to `https://graph.facebook.com/v18.0`

3. **Create Message Template**
   - Go to WhatsApp Business Manager
   - Create a template named `otp_verification`
   - Template text: `🩸 LifePulse Verification Code\n\nYour {{1}} OTP is: {{2}}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this message.`

### Option 3: MessageBird (Alternative)

1. **Sign up for MessageBird**
   - Go to [MessageBird](https://messagebird.com/)
   - Create an account
   - Enable WhatsApp Business API

## 🔧 Environment Configuration

### For Twilio (Current Setup)
```env
# Twilio Configuration (for WhatsApp OTP and SMS fallback)
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_actual_auth_token_here
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
TWILIO_CONTENT_SID=your_twilio_content_sid_here
TWILIO_PHONE_NUMBER=+1234567890
```

### For Meta WhatsApp Business API
```env
# WhatsApp Business API Configuration
WHATSAPP_API_KEY=your-whatsapp-business-api-key
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your-whatsapp-phone-number-id
```

## 📱 Testing Without WhatsApp

If you don't want to set up WhatsApp immediately, the system will:

1. **Console Log**: OTP will be logged to the console
2. **SMS Fallback**: Use Twilio SMS if configured
3. **Development Mode**: Show OTP in alerts for testing

## 🧪 Testing the OTP System

### 1. Test Twilio Integration
```bash
cd backend
node test-twilio.js
```

### 2. Test OTP Endpoints
```bash
# Send OTP
curl -X POST http://localhost:5000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919656595993", "type": "LOGIN"}'

# Verify OTP
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919656595993", "otp": "123456", "type": "LOGIN"}'
```

### 3. Test from Frontend
1. Start the backend server
2. Start the frontend: `cd frontend && npm start`
3. Try logging in with a phone number
4. Check console logs for OTP codes

## 🔒 Security Features

- **OTP Expiration**: 10 minutes
- **Maximum Attempts**: 5 attempts per OTP
- **Auto-cleanup**: Expired OTPs are automatically deleted
- **Rate Limiting**: Prevents spam
- **Phone Validation**: Validates phone number format

## 📋 OTP Flow

1. **User enters phone number**
2. **System generates 6-digit OTP**
3. **OTP sent via WhatsApp/SMS**
4. **User enters OTP in app**
5. **System verifies OTP**
6. **User logged in/registered**

## 🛠️ Customization

### Change OTP Expiry Time
Edit `backend/src/routes/auth.js`:
```javascript
const otpRecord = await OTP.createOTP(phone, type, 15); // 15 minutes
```

### Change OTP Length
Edit `backend/src/models/OTP.js`:
```javascript
otp: {
  type: String,
  required: [true, 'OTP is required'],
  length: 4 // Change to 4 digits
}
```

### Customize Message Format
Edit `backend/src/services/whatsappService.js`:
```javascript
formatOTPMessage(otp, type) {
  return `Your LifePulse ${type} code is: ${otp}`;
}
```

## 🚨 Troubleshooting

### OTP Not Received
1. Check console logs for OTP codes
2. Verify phone number format
3. Check Twilio credentials
4. Ensure WhatsApp template is approved

### API Errors
1. Check environment variables
2. Verify API endpoints
3. Check rate limits
4. Review error logs

### Development Testing
- OTP codes are logged to console
- Use test phone numbers
- Check network connectivity

## 📞 Support

For Twilio issues:
- [Twilio WhatsApp Documentation](https://www.twilio.com/docs/whatsapp)
- [Twilio Console](https://console.twilio.com/)

For WhatsApp Business API issues:
- [Meta Developer Documentation](https://developers.facebook.com/docs/whatsapp)
- [WhatsApp Business API Guide](https://developers.facebook.com/docs/whatsapp/cloud-api)

## 🎯 Next Steps

1. **Get your Twilio Auth Token** and add it to `.env`
2. **Test the integration** with `node test-twilio.js`
3. **Try the full flow** from the frontend app
4. **Monitor logs** for any issues 