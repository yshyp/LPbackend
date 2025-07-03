const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      return admin.apps[0];
    }

    // Check if Firebase credentials are properly configured
    const requiredFields = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_PRIVATE_KEY_ID', 
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_CLIENT_EMAIL'
    ];

    const missingFields = requiredFields.filter(field => 
      !process.env[field] || 
      process.env[field].includes('your-') || 
      process.env[field] === 'your-firebase-project-id' ||
      process.env[field] === 'your-firebase-private-key-id' ||
      process.env[field] === 'your-firebase-private-key' ||
      process.env[field] === 'your-firebase-client-email'
    );

    if (missingFields.length > 0) {
      console.log('⚠️ Firebase credentials not configured. Skipping Firebase initialization.');
      console.log('📱 Push notifications will be disabled');
      return null;
    }

    // Service account configuration from environment variables
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    };

    // Initialize the app
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID
    });

    console.log('✅ Firebase Admin SDK initialized successfully');
    return app;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    console.log('⚠️ Firebase initialization failed: Failed to initialize Firebase Admin SDK');
    console.log('📱 Push notifications will be disabled');
    return null;
  }
};

// Send notification to a single device
const sendNotification = async (token, title, body, data = {}) => {
  try {
    // Check if Firebase is initialized
    if (admin.apps.length === 0) {
      console.log('⚠️ Firebase not initialized. Push notification skipped.');
      return { success: false, reason: 'Firebase not configured' };
    }

    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      token
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Notification sent successfully:', response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Send notification error:', error);
    return { success: false, error: error.message };
  }
};

// Send notification to multiple devices
const sendMulticastNotification = async (tokens, title, body, data = {}) => {
  try {
    // Check if Firebase is initialized
    if (admin.apps.length === 0) {
      console.log('⚠️ Firebase not initialized. Multicast push notification skipped.');
      return { successCount: 0, failureCount: tokens.length, success: false, reason: 'Firebase not configured' };
    }

    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      tokens
    };

    const response = await admin.messaging().sendMulticast(message);
    console.log('✅ Multicast notification sent:', {
      successCount: response.successCount,
      failureCount: response.failureCount
    });
    return response;
  } catch (error) {
    console.error('❌ Multicast notification error:', error);
    return { successCount: 0, failureCount: tokens.length, success: false, error: error.message };
  }
};

// Send notification to a topic
const sendTopicNotification = async (topic, title, body, data = {}) => {
  try {
    // Check if Firebase is initialized
    if (admin.apps.length === 0) {
      console.log('⚠️ Firebase not initialized. Topic push notification skipped.');
      return { success: false, reason: 'Firebase not configured' };
    }

    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      topic
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Topic notification sent successfully:', response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Topic notification error:', error);
    return { success: false, error: error.message };
  }
};

// Subscribe device to a topic
const subscribeToTopic = async (tokens, topic) => {
  try {
    // Check if Firebase is initialized
    if (admin.apps.length === 0) {
      console.log('⚠️ Firebase not initialized. Topic subscription skipped.');
      return { successCount: 0, failureCount: Array.isArray(tokens) ? tokens.length : 1, success: false, reason: 'Firebase not configured' };
    }

    const response = await admin.messaging().subscribeToTopic(tokens, topic);
    console.log('✅ Subscribed to topic:', response);
    return response;
  } catch (error) {
    console.error('❌ Subscribe to topic error:', error);
    return { successCount: 0, failureCount: Array.isArray(tokens) ? tokens.length : 1, success: false, error: error.message };
  }
};

// Unsubscribe device from a topic
const unsubscribeFromTopic = async (tokens, topic) => {
  try {
    // Check if Firebase is initialized
    if (admin.apps.length === 0) {
      console.log('⚠️ Firebase not initialized. Topic unsubscription skipped.');
      return { successCount: 0, failureCount: Array.isArray(tokens) ? tokens.length : 1, success: false, reason: 'Firebase not configured' };
    }

    const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);
    console.log('✅ Unsubscribed from topic:', response);
    return response;
  } catch (error) {
    console.error('❌ Unsubscribe from topic error:', error);
    return { successCount: 0, failureCount: Array.isArray(tokens) ? tokens.length : 1, success: false, error: error.message };
  }
};

module.exports = {
  initializeFirebase,
  sendNotification,
  sendMulticastNotification,
  sendTopicNotification,
  subscribeToTopic,
  unsubscribeFromTopic,
  admin
}; 