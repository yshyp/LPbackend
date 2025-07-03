# LifePulse User Choice Verification System

## Overview

The LifePulse application now supports **user choice verification**, allowing users to explicitly choose between SMS and Email verification methods. This provides maximum flexibility and user control over their verification preferences.

## 🎯 **Key Features**

### **User Choice Options**
1. **Auto Detect** - Automatically chooses based on input (email → Email, phone → SMS)
2. **SMS/WhatsApp** - Force SMS/WhatsApp verification
3. **Email** - Force email verification

### **Smart Validation**
- Prevents invalid combinations (e.g., SMS with email address)
- Real-time feedback on method compatibility
- Clear error messages for invalid selections

### **Unified Interface**
- Single component for method selection
- Consistent UI across all verification flows
- Visual feedback for selected methods

## 📱 **Frontend Implementation**

### **VerificationMethodSelector Component**

The main component that handles method selection:

```javascript
import VerificationMethodSelector from '../../components/VerificationMethodSelector';

// Usage in LoginScreen
<VerificationMethodSelector
  selectedMethod={verificationMethod}
  onMethodSelect={setVerificationMethod}
  identifier={identifier}
  onSendCode={handleSendVerification}
  loading={loading}
/>
```

### **Component Features**

#### **Visual Design**
- **Card-based layout** with clear method options
- **Color-coded icons** for each method
- **Selection indicators** with checkmarks
- **Auto-detect preview** showing what method will be used

#### **Smart Validation**
- **Real-time compatibility checking**
- **Alert dialogs** for invalid selections
- **Disabled states** when methods are incompatible

#### **User Experience**
- **Summary section** showing final verification details
- **Masked identifier** for privacy
- **Loading states** during code sending
- **Clear call-to-action** button

## 🔧 **Backend API**

### **Enhanced Verification Endpoints**

#### **Send Verification Code**
```http
POST /api/verification/send
```

**Request Body:**
```json
{
  "identifier": "user@example.com", // or "+1234567890"
  "type": "LOGIN", // LOGIN, REGISTRATION, or PASSWORD_RESET
  "method": "EMAIL", // SMS, EMAIL, or AUTO
  "userName": "John Doe" // optional
}
```

**Response:**
```json
{
  "message": "Verification code sent successfully via Email",
  "method": "EMAIL",
  "userChoice": "EMAIL",
  "expiresAt": "2024-01-15T10:30:00.000Z"
}
```

#### **Resend Verification Code**
```http
POST /api/verification/resend
```

**Request Body:**
```json
{
  "identifier": "user@example.com",
  "type": "LOGIN",
  "method": "EMAIL" // SMS, EMAIL, or AUTO
}
```

### **Method Validation Logic**

The backend validates method compatibility:

```javascript
// Validate method compatibility with identifier
if (verificationMethod === 'EMAIL' && !identifier.includes('@')) {
  return res.status(400).json({
    error: 'Email verification requires a valid email address'
  });
}

if (verificationMethod === 'SMS' && identifier.includes('@')) {
  return res.status(400).json({
    error: 'SMS verification requires a valid phone number'
  });
}
```

## 🎨 **UI/UX Design**

### **Method Selection Cards**

Each method is presented as a card with:

1. **Icon** - Visual representation (phone, email, auto-detect)
2. **Title** - Clear method name
3. **Subtitle** - Brief description
4. **Selection indicator** - Checkmark when selected

### **Auto-Detect Preview**

When "Auto Detect" is selected and an identifier is entered:
- Shows which method will actually be used
- Updates in real-time as user types
- Provides clear feedback

### **Verification Summary**

After method selection:
- Shows masked identifier for privacy
- Displays final verification method
- Confirms user's choice

## 📋 **Usage Examples**

### **React Native Implementation**

#### **Login Screen**
```javascript
const LoginScreen = () => {
  const [identifier, setIdentifier] = useState('');
  const [verificationMethod, setVerificationMethod] = useState('AUTO');
  const [loading, setLoading] = useState(false);

  const handleSendVerification = async (method) => {
    try {
      await authService.sendVerification(identifier, 'LOGIN', method);
      // Navigate to verification screen
    } catch (error) {
      // Handle error
    }
  };

  return (
    <View>
      <Input
        label="Phone Number or Email"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="Enter your phone number or email"
      />
      
      <VerificationMethodSelector
        selectedMethod={verificationMethod}
        onMethodSelect={setVerificationMethod}
        identifier={identifier}
        onSendCode={handleSendVerification}
        loading={loading}
      />
    </View>
  );
};
```

#### **Registration Screen**
```javascript
const RegisterScreen = () => {
  const [identifier, setIdentifier] = useState('');
  const [verificationMethod, setVerificationMethod] = useState('AUTO');

  const handleSendVerification = async (method) => {
    try {
      await authService.sendVerification(identifier, 'REGISTRATION', method);
      // Navigate to verification screen
    } catch (error) {
      // Handle error
    }
  };

  return (
    <View>
      <Input
        label="Phone Number or Email"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="Enter your phone number or email"
      />
      
      <VerificationMethodSelector
        selectedMethod={verificationMethod}
        onMethodSelect={setVerificationMethod}
        identifier={identifier}
        onSendCode={handleSendVerification}
      />
    </View>
  );
};
```

### **cURL Examples**

#### **Send SMS Verification**
```bash
curl -X POST http://localhost:5000/api/verification/send \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+1234567890",
    "type": "LOGIN",
    "method": "SMS",
    "userName": "John Doe"
  }'
```

#### **Send Email Verification**
```bash
curl -X POST http://localhost:5000/api/verification/send \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "type": "LOGIN",
    "method": "EMAIL",
    "userName": "John Doe"
  }'
```

#### **Auto-Detect Method**
```bash
curl -X POST http://localhost:5000/api/verification/send \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "type": "LOGIN",
    "method": "AUTO",
    "userName": "John Doe"
  }'
```

## 🔒 **Security & Validation**

### **Input Validation**
- **Email format validation** for email addresses
- **Phone number format validation** for phone numbers
- **Method compatibility checking** before sending

### **Rate Limiting**
- **5 requests per 15 minutes** for sending codes
- **10 attempts per 15 minutes** for verification
- **IP-based limiting** to prevent abuse

### **Error Handling**
- **Clear error messages** for invalid selections
- **Graceful fallbacks** when services are unavailable
- **Comprehensive logging** for security monitoring

## 🎯 **User Experience Flow**

### **1. Method Selection**
1. User enters phone number or email
2. User selects preferred verification method
3. System validates compatibility
4. User sees verification summary

### **2. Code Sending**
1. User clicks "Send Verification Code"
2. System sends code via selected method
3. User receives confirmation
4. User navigates to verification screen

### **3. Code Verification**
1. User enters 6-digit code
2. System verifies code
3. User is authenticated/logged in
4. User proceeds to main app

## 🔧 **Configuration**

### **Environment Variables**
```env
# Verification Configuration
VERIFICATION_METHOD=SMS
# Options: SMS or EMAIL (default method when AUTO is not specified)
```

### **Component Props**
```javascript
VerificationMethodSelector.propTypes = {
  onMethodSelect: PropTypes.func.required,
  selectedMethod: PropTypes.oneOf(['AUTO', 'SMS', 'EMAIL']),
  identifier: PropTypes.string,
  onSendCode: PropTypes.func.required,
  loading: PropTypes.bool,
  disabled: PropTypes.bool
};
```

## 🚀 **Benefits**

### **For Users**
- **Choice and control** over verification method
- **Flexibility** to use preferred communication channel
- **Clear feedback** on method selection
- **Consistent experience** across the app

### **For Developers**
- **Reusable component** for all verification flows
- **Unified API** for both SMS and Email
- **Easy integration** with existing screens
- **Comprehensive error handling**

### **For Business**
- **Higher conversion rates** with user choice
- **Reduced support requests** with clear validation
- **Better user satisfaction** with preferred methods
- **Scalable solution** for future verification needs

## 🔄 **Migration Guide**

### **From Old System**
1. **Replace OTP components** with VerificationMethodSelector
2. **Update API calls** to use new verification endpoints
3. **Test both SMS and Email** flows
4. **Update error handling** for new validation

### **Backward Compatibility**
- **Legacy OTP endpoints** still work
- **Existing user flows** remain functional
- **Gradual migration** possible
- **No breaking changes** to existing functionality

---

**Note**: This user choice verification system provides maximum flexibility while maintaining security and user experience standards. Users can now choose their preferred verification method while the system ensures compatibility and security. 