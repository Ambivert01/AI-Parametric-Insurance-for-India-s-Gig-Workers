const axios = require('axios');
const User = require('../../models/User');
const logger = require('../../utils/logger');

// ─── Template messages ────────────────────────────────────
const TEMPLATES = {
  OTP: (otp) =>
    `🔐 Your GigShield OTP is: *${otp}*\nValid for 10 minutes. Do NOT share this with anyone.`,

  POLICY_ACTIVATED: (name, tier, weekId, amountInr) =>
    `✅ *GigShield Active!*\nNamaste ${name} 🙏\nYour *${tier} Shield* is active for week ${weekId}.\nPremium paid: ₹${amountInr}\nYou're now protected against rain, AQI spikes & more. Stay safe!`,

  PAYOUT_SUCCESS: (name, amountInr, triggerType, utr) =>
    `💰 *₹${amountInr} Credited!*\nNamaste ${name},\nYour GigShield claim has been approved due to *${formatTrigger(triggerType)}*.\n₹${amountInr} has been sent to your UPI.\nRef: ${utr}\nStay safe out there! 🙏`,

  CLAIM_HOLD: (name, amountInr) =>
    `⏳ *Claim Under Verification*\nNamaste ${name},\nYour claim of ₹${amountInr} is being verified.\nPlease share a quick photo showing the disruption to speed up processing.\nReply with your photo or type *SKIP* to wait for manual review (4 hours).`,

  CLAIM_REJECTED: (name, reason, appealDeadline) =>
    `❌ *Claim Not Approved*\nNamaste ${name},\nWe could not verify your claim.\nReason: ${reason}\nThis is NOT final. You can *appeal* within 72 hours (before ${appealDeadline}).\nOpen GigShield app to submit your appeal. We review all appeals fairly. 🙏`,

  APPEAL_APPROVED: (name, amountInr) =>
    `✅ *Appeal Approved!*\nNamaste ${name},\nYour appeal was reviewed and approved!\n₹${amountInr} + ₹${50} goodwill credit has been added.\nWe're sorry for the inconvenience. 🙏`,

  TRIGGER_ALERT: (name, triggerType, city) =>
    `⚠️ *GigShield Alert*\nNamaste ${name},\n*${formatTrigger(triggerType)}* detected in ${city}.\nIf you cannot work, your policy will *automatically* cover you.\nYou do NOT need to do anything. We're watching out for you. 🙏`,

  RISK_ALERT: (name, triggerType, city, tomorrow) =>
    `🌧️ *Tomorrow's Risk Alert*\nNamaste ${name},\n${formatTrigger(triggerType)} expected in ${city} ${tomorrow ? 'tomorrow' : 'soon'}.\nYour GigShield policy is active and will auto-trigger if conditions are met.\nConsider adjusting your shift timing. Stay safe! 🙏`,

  RENEWAL_REMINDER: (name, tier, amountInr) =>
    `🔔 *Renew Your Shield*\nNamaste ${name},\nYour GigShield *${tier} Shield* expires tonight at 11:59 PM.\nRenew for ₹${amountInr}/week to stay protected next week.\nTap to renew: [GigShield App Link]`,

  POLICY_LAPSED: (name) =>
    `⚠️ *Coverage Lapsed*\nNamaste ${name},\nYour GigShield policy has expired. You are currently *not covered*.\nRenew now to protect your income from rain, AQI spikes & more.`,

  STREAK_MILESTONE: (name, weeks, discount) =>
    `🏆 *${weeks}-Week Streak!*\nNamaste ${name},\nAmazing! You've been protected for *${weeks} weeks*.\nYou've earned a *${discount}% discount* on your next premium!\nKeep the streak going 🔥`,
};

const formatTrigger = (type) => {
  const map = {
    HEAVY_RAIN: 'Heavy Rain / Flooding',
    AQI_SPIKE: 'Severe Air Pollution (AQI)',
    EXTREME_HEAT: 'Extreme Heat',
    CYCLONE: 'Cyclone / Storm Warning',
    CURFEW: 'Curfew / Section 144',
    PLATFORM_OUTAGE: 'Platform App Outage',
    TRAFFIC_SHUTDOWN: 'Road Shutdown',
    BANDH: 'Bandh / Strike',
  };
  return map[type] || type;
};

// ─── WhatsApp via Twilio ──────────────────────────────────
const sendWhatsApp = async (phone, message) => {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    logger.info(`[DEV WhatsApp → +91${phone}]: ${message.slice(0, 80)}...`);
    return { success: true, mock: true };
  }
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const msg = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:+91${phone}`,
      body: message,
    });
    return { success: true, sid: msg.sid };
  } catch (err) {
    logger.error(`WhatsApp send failed to ${phone}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

// ─── SMS via Twilio ───────────────────────────────────────
const sendSMS = async (phone, message) => {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    logger.info(`[DEV SMS → +91${phone}]: ${message.slice(0, 80)}...`);
    return { success: true, mock: true };
  }
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const msg = await client.messages.create({
      from: process.env.TWILIO_PHONE_FROM || '+1XXXXXXXXXX',
      to: `+91${phone}`,
      body: message,
    });
    return { success: true, sid: msg.sid };
  } catch (err) {
    logger.error(`SMS send failed to ${phone}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

// ─── Push Notification via Firebase ──────────────────────
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!process.env.FIREBASE_PROJECT_ID || !fcmToken) {
    logger.info(`[DEV Push]: ${title} — ${body}`);
    return { success: true, mock: true };
  }
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });
    }
    const result = await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { channelId: 'gigshield_alerts' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    return { success: true, messageId: result };
  } catch (err) {
    logger.error(`Push notification failed: ${err.message}`);
    return { success: false, error: err.message };
  }
};

// ─── Master send function ─────────────────────────────────
const sendNotification = async (riderId, messageKey, templateData = {}) => {
  const rider = await User.findById(riderId)
    .select('phone name notificationPrefs devices')
    .lean();
  if (!rider) return;

  const prefs = rider.notificationPrefs || {};
  const fcmToken = rider.devices?.slice(-1)[0]?.fcmToken;

  const results = {};

  // Build message based on key
  let message = '';
  let pushTitle = 'GigShield Alert';
  let pushBody = '';

  switch (messageKey) {
    case 'payout-success':
      message = TEMPLATES.PAYOUT_SUCCESS(rider.name, templateData.amountInr, templateData.triggerType, templateData.utr);
      pushTitle = `₹${templateData.amountInr} Credited! 💰`;
      pushBody = `Your GigShield claim has been paid. Check your UPI.`;
      break;
    case 'policy-activated':
      message = TEMPLATES.POLICY_ACTIVATED(rider.name, templateData.tier, templateData.weekId, templateData.amountInr);
      pushTitle = 'GigShield Active! ✅';
      pushBody = `Your ${templateData.tier} policy is active for this week.`;
      break;
    case 'claim-rejected':
      message = TEMPLATES.CLAIM_REJECTED(rider.name, 'location could not be verified', templateData.appealDeadline);
      pushTitle = 'Claim Update';
      pushBody = 'Your claim needs review. Tap to appeal.';
      break;
    case 'request-selfie':
      message = TEMPLATES.CLAIM_HOLD(rider.name, templateData.amountInr);
      pushTitle = '📸 Quick Verification Needed';
      pushBody = `Share a photo to release ₹${templateData.amountInr} faster.`;
      break;
    case 'trigger-alert':
      message = TEMPLATES.TRIGGER_ALERT(rider.name, templateData.triggerType, templateData.city);
      pushTitle = `⚠️ ${formatTrigger(templateData.triggerType)} Detected`;
      pushBody = `GigShield is auto-monitoring your coverage.`;
      break;
    case 'renewal-reminder':
      message = TEMPLATES.RENEWAL_REMINDER(rider.name, templateData.tier, templateData.amountInr);
      pushTitle = '🔔 Renew Your Shield Tonight';
      pushBody = `Don't lose coverage. Renew for ₹${templateData.amountInr}.`;
      break;
    case 'streak-milestone':
      message = TEMPLATES.STREAK_MILESTONE(rider.name, templateData.weeks, templateData.discount * 100);
      pushTitle = `🏆 ${templateData.weeks}-Week Streak!`;
      pushBody = `You've earned ${templateData.discount * 100}% off your next premium!`;
      break;
    case 'appeal-received':
      message = `✅ Appeal received for your claim. We'll review within ${templateData.manualReviewSLAHours} hours.`;
      pushTitle = 'Appeal Submitted';
      pushBody = 'We\'ll review your appeal within 4 hours.';
      break;
    default:
      message = templateData.message || '';
      pushBody = message.slice(0, 100);
  }

  // Send via preferred channels
  if (prefs.whatsapp !== false) {
    results.whatsapp = await sendWhatsApp(rider.phone, message);
  }
  if (prefs.sms !== false && !results.whatsapp?.success) {
    // SMS as fallback if WhatsApp fails
    results.sms = await sendSMS(rider.phone, message.replace(/\*/g, ''));
  }
  if (prefs.push !== false && fcmToken) {
    results.push = await sendPushNotification(fcmToken, pushTitle, pushBody, templateData);
  }

  logger.info(`Notification sent: ${messageKey} → rider ${riderId}`, {
    channels: Object.keys(results).filter(k => results[k]?.success),
  });

  return results;
};

// ─── Bulk notification (for trigger events affecting many riders) ─
const sendBulkNotification = async (riderIds, messageKey, templateData = {}) => {
  const BATCH_SIZE = 50;
  const results = { sent: 0, failed: 0 };

  for (let i = 0; i < riderIds.length; i += BATCH_SIZE) {
    const batch = riderIds.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(id => sendNotification(id, messageKey, templateData)
        .then(() => results.sent++)
        .catch(() => results.failed++)
      )
    );
    // Rate limit: small delay between batches
    if (i + BATCH_SIZE < riderIds.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return results;
};

module.exports = { sendNotification, sendBulkNotification, sendWhatsApp, sendSMS, sendPushNotification };
