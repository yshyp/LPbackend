# Firebase Setup Guide for LifePulse

This guide will help you set up Firebase Cloud Messaging (FCM) for push notifications in the LifePulse blood donor app.

## Prerequisites

- Google account
- Firebase project
- Node.js backend
- React Native (Expo) frontend

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter project name: `lifepulse-app`
4. Enable Google Analytics (optional)
5. Click "Create project"

## Step 2: Enable Cloud Messaging

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Click on **Cloud Messaging** tab
3. Note down the **Server key** (you'll need this for testing)

## Step 3: Generate Service Account Key

1. In Firebase Console, go to **Project Settings** → **Service Accounts**
2. Click **"Generate new private key"**
3. Download the JSON file
4. **IMPORTANT**: Keep this file secure and never commit it to version control

## Step 4: Configure Backend Environment Variables

1. Copy the downloaded service account JSON content
2. Update your `backend/.env` file with the following variables:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project.iam.gserviceaccount.com
```

**Note**: Replace the values with actual values from your service account JSON file.

## Step 5: Configure Frontend (Expo)

### Option A: Using Expo Push Notifications (Recommended for development)

1. Install Expo push notification service:
```bash
cd frontend
expo install expo-notifications
```

2. The app is already configured to use Expo's push notification service.

### Option B: Using Firebase SDK (For production)

1. Install Firebase SDK:
```bash
cd frontend
expo install @react-native-firebase/app @react-native-firebase/messaging
```

2. Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from Firebase Console
3. Place them in the appropriate directories

## Step 6: Test Push Notifications

### Backend Testing

1. Start your backend server:
```bash
cd backend
npm start
```

2. Test the notification endpoint:
```bash
curl -X POST http://localhost:5000/api/notifications/push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "donorIds": ["donor_id_here"],
    "title": "Test Notification",
    "body": "This is a test notification",
    "data": {"type": "test"}
  }'
```

### Frontend Testing

1. Start your Expo app:
```bash
cd frontend
expo start
```

2. The app will automatically request notification permissions
3. Check the console for FCM token registration
4. Test notifications through the app interface

## Step 7: Production Deployment

### Backend Deployment

1. Set environment variables in your production environment
2. Ensure Firebase service account has proper permissions
3. Test notifications in production environment

### Frontend Deployment

1. Build the app for production:
```bash
cd frontend
expo build:android  # or expo build:ios
```

2. Upload to app stores (Google Play Store / Apple App Store)

## Troubleshooting

### Common Issues

1. **"Firebase initialization failed"**
   - Check environment variables are correctly set
   - Verify service account JSON is valid
   - Ensure Firebase project ID matches

2. **"No valid FCM tokens found"**
   - Check if users have granted notification permissions
   - Verify FCM token is being saved to database
   - Check if users are marked as available

3. **Notifications not received**
   - Check device notification settings
   - Verify FCM token is valid
   - Check Firebase Console for delivery status

### Debug Commands

```bash
# Check Firebase configuration
curl -X GET http://localhost:5000/health

# Test notification to specific user
curl -X POST http://localhost:5000/api/notifications/push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "donorIds": ["USER_ID"],
    "title": "Debug Test",
    "body": "Testing notifications",
    "data": {"debug": "true"}
  }'
```

## Security Best Practices

1. **Never commit service account keys to version control**
2. **Use environment variables for all sensitive data**
3. **Implement proper authentication for notification endpoints**
4. **Rate limit notification requests**
5. **Validate notification content**
6. **Log notification delivery for debugging**

## Monitoring

1. **Firebase Console**: Monitor notification delivery
2. **Backend Logs**: Check for notification errors
3. **App Analytics**: Track notification engagement
4. **Error Tracking**: Monitor failed notifications

## Support

If you encounter issues:

1. Check Firebase Console for error messages
2. Review backend logs for detailed error information
3. Verify all environment variables are set correctly
4. Test with a simple notification first
5. Check device notification permissions

---

**Note**: This setup uses Expo's push notification service for development. For production, consider using Firebase SDK directly for better control and features. 