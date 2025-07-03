const mongoose = require('mongoose');
const User = require('./models/User');
const { sendEligibilityReminder } = require('./services/notificationService');
const { logSystemEvent, logError } = require('./services/loggerService');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Find donors who are now eligible and haven't been reminded in this window
  const users = await User.find({
    role: 'DONOR',
    'medicalHistory.lastDonationDate': { $lte: ninetyDaysAgo },
    $or: [
      { lastEligibilityReminderAt: null },
      { lastEligibilityReminderAt: { $lt: '$medicalHistory.lastDonationDate' } }
    ],
    fcmToken: { $ne: null }
  });

  for (const user of users) {
    try {
      const result = await sendEligibilityReminder(user);
      if (result.success) {
        user.lastEligibilityReminderAt = now;
        await user.save();
        logSystemEvent('eligibility_reminder_sent', { userId: user._id, phone: user.phone });
      } else {
        logSystemEvent('eligibility_reminder_failed', { userId: user._id, phone: user.phone, reason: result.reason });
      }
    } catch (error) {
      logError(error, { context: 'eligibility_reminder', userId: user._id });
    }
  }
  await mongoose.disconnect();
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); }); 