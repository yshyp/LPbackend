const { sendNotification } = require('../config/firebase');

async function sendEligibilityReminder(user) {
  if (!user.fcmToken) return { success: false, reason: 'No FCM token' };
  const title = 'You are eligible to donate blood again!';
  const body = 'Thank you for being a lifesaver. You can now donate blood again.';
  const data = { type: 'eligibility_reminder' };
  return await sendNotification(user.fcmToken, title, body, data);
}

async function sendChatMessageNotification(user, fromName, message, requestId) {
  if (!user.fcmToken) return { success: false, reason: 'No FCM token' };
  const title = `New message from ${fromName}`;
  const body = message.length > 60 ? message.slice(0, 57) + '...' : message;
  const data = { type: 'chat_message', requestId };
  return await sendNotification(user.fcmToken, title, body, data);
}

module.exports = {
  sendEligibilityReminder,
  sendChatMessageNotification
}; 