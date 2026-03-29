const User = require('../../models/User');
const Policy = require('../../models/Policy');
const Claim = require('../../models/Claim');
const { Payout, LoyaltyPool } = require('../../models/index');
const { redis, KEYS } = require('../../config/redis');
const { POLICY_STATUS, PAYMENT_STATUS, BUSINESS_RULES } = require('../../config/constants');
const { getPolicyWeekId } = require('../../utils/dateTime');
const logger = require('../../utils/logger');

// ──────────────────────────────────────────────────────────
// COMMUNITY STATS — anonymized zone-level statistics
// Innovation 5: Community Social Proof
// ──────────────────────────────────────────────────────────
const getCommunityStats = async (cityId, platform) => {
  const cacheKey = `community:stats:${cityId}:${platform || 'all'}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const weekId = getPolicyWeekId();
  const filter = { status: POLICY_STATUS.ACTIVE, weekId };
  if (cityId) filter.cityId = cityId;

  const [activePolicies, weekClaims, totalProtected] = await Promise.all([
    Policy.countDocuments(filter),
    Claim.countDocuments({
      cityId,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 3600000) },
    }),
    Payout.aggregate([
      {
        $match: {
          status: PAYMENT_STATUS.COMPLETED,
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600000) },
        },
      },
      { $group: { _id: null, total: { $sum: '$amountInr' }, count: { $sum: 1 } } },
    ]),
  ]);

  // Recent payout events for social feed
  const recentPayouts = await Claim.find({
    cityId,
    status: 'payout_completed',
    createdAt: { $gte: new Date(Date.now() - 24 * 3600000) },
  })
    .select('triggerType cityId finalPayoutInr createdAt')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  // Zone risk snapshot
  const weatherCache = await redis.get(KEYS.weatherCache(cityId));

  const stats = {
    cityId,
    weekId,
    activePoliciesInZone: activePolicies,
    weeklyClaimsCount: weekClaims,
    totalMonthlyProtectedInr: totalProtected[0]?.total || 0,
    totalMonthlyClaimsCount: totalProtected[0]?.count || 0,
    recentPayoutEvents: recentPayouts.map((p) => ({
      triggerType: p.triggerType,
      amountInr: p.finalPayoutInr,
      hoursAgo: Math.round((Date.now() - new Date(p.createdAt).getTime()) / 3600000),
    })),
    currentZoneRisk: {
      rainfall3h: weatherCache?.rainfall3h || 0,
      feelsLike: weatherCache?.feelsLike || null,
      aqi: null, // filled from AQI cache if available
    },
    socialProofMessage: _buildSocialMessage(activePolicies, weekClaims, cityId),
    updatedAt: new Date().toISOString(),
  };

  await redis.set(cacheKey, stats, 10 * 60); // 10 min cache
  return stats;
};

const _buildSocialMessage = (policies, claims, city) => {
  if (claims > 50) {
    return `${claims} riders in ${city} received payouts this week. Stay protected.`;
  }
  if (policies > 100) {
    return `${policies} active GigShield riders in your area this week.`;
  }
  return `Join ${policies} riders already protected in ${city}.`;
};

// ──────────────────────────────────────────────────────────
// LOYALTY POOL
// ──────────────────────────────────────────────────────────
const getLoyaltyPoolStats = async (weekId = null) => {
  const wid = weekId || getPolicyWeekId();
  let pool = await LoyaltyPool.findOne({ weekId: wid }).lean();
  if (!pool) {
    pool = { weekId: wid, balanceInr: 0, contributionsInr: 0, disbursedInr: 0 };
  }
  // All-time total
  const allTime = await LoyaltyPool.aggregate([
    { $group: { _id: null, total: { $sum: '$disbursedInr' }, weeks: { $sum: 1 } } },
  ]);
  return {
    currentWeek: pool,
    allTime: {
      totalDisbursedInr: allTime[0]?.total || 0,
      totalWeeks: allTime[0]?.weeks || 0,
    },
  };
};

const contributeToPool = async (riderId, amountInr, weekId) => {
  const wid = weekId || getPolicyWeekId();
  await LoyaltyPool.findOneAndUpdate(
    { weekId: wid },
    {
      $inc: {
        balanceInr: amountInr,
        contributionsInr: amountInr,
        contributors: 1,
      },
    },
    { upsert: true }
  );
  logger.info(`Loyalty pool contribution: ₹${amountInr} from rider ${riderId} for week ${wid}`);
};

// ──────────────────────────────────────────────────────────
// WALLET
// ──────────────────────────────────────────────────────────
const getWalletBalance = async (riderId) => {
  const user = await User.findById(riderId).select('walletBalance referralCount loyaltyTier loyaltyDiscount safeWeekStreak').lean();
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  return {
    balanceInr: user.walletBalance || 0,
    loyaltyTier: user.loyaltyTier || 'none',
    discountPercent: Math.round((user.loyaltyDiscount || 0) * 100),
    safeWeekStreak: user.safeWeekStreak || 0,
    referralCount: user.referralCount || 0,
    referralCreditsEarnedInr: (user.referralCount || 0) * BUSINESS_RULES.REFERRAL_CREDIT_INR,
  };
};

const redeemWalletBalance = async (riderId, amountInr, purpose) => {
  const user = await User.findById(riderId);
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  if ((user.walletBalance || 0) < amountInr) {
    throw Object.assign(new Error('Insufficient wallet balance'), { statusCode: 400 });
  }
  user.walletBalance -= amountInr;
  await user.save();
  await redis.del(KEYS.session(riderId.toString()));
  logger.audit('WALLET_REDEEM', riderId, { amountInr, purpose });
  return { newBalance: user.walletBalance };
};

// ──────────────────────────────────────────────────────────
// REFERRAL
// ──────────────────────────────────────────────────────────
const applyReferralCode = async (newUserId, referralCode) => {
  const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
  if (!referrer) throw Object.assign(new Error('Invalid referral code'), { statusCode: 400 });
  if (referrer._id.toString() === newUserId.toString()) {
    throw Object.assign(new Error('Cannot use your own referral code'), { statusCode: 400 });
  }

  const newUser = await User.findById(newUserId);
  if (newUser.referredBy) {
    throw Object.assign(new Error('Referral code already applied'), { statusCode: 409 });
  }

  // Credit both users
  const credit = BUSINESS_RULES.REFERRAL_CREDIT_INR;
  newUser.referredBy = referrer._id;
  newUser.walletBalance = (newUser.walletBalance || 0) + credit;
  await newUser.save();

  await User.findByIdAndUpdate(referrer._id, {
    $inc: { referralCount: 1, walletBalance: credit },
  });

  // Invalidate caches
  await redis.del(KEYS.session(newUserId.toString()));
  await redis.del(KEYS.session(referrer._id.toString()));

  logger.audit('REFERRAL_APPLIED', newUserId, {
    referrerId: referrer._id,
    creditEach: credit,
  });

  return { applied: true, creditEarnedInr: credit, referrerName: referrer.name };
};

const getReferralStats = async (riderId) => {
  const user = await User.findById(riderId).select('referralCode referralCount walletBalance').lean();
  const referredUsers = await User.find({ referredBy: riderId })
    .select('name createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  return {
    referralCode: user.referralCode,
    referralCount: user.referralCount || 0,
    totalCreditsEarnedInr: (user.referralCount || 0) * BUSINESS_RULES.REFERRAL_CREDIT_INR,
    recentReferrals: referredUsers.map((u) => ({
      name: u.name,
      joinedAt: u.createdAt,
    })),
  };
};

// ──────────────────────────────────────────────────────────
// NOTIFICATION HISTORY
// ──────────────────────────────────────────────────────────
// Store recent notifications in Redis (last 50 per rider)
const NOTIF_KEY = (riderId) => `notif:history:${riderId}`;

const saveNotificationToHistory = async (riderId, type, message, data = {}) => {
  const client = require('../../config/redis').getRedisClient();
  const entry = JSON.stringify({
    id: Date.now().toString(),
    type,
    message: message.slice(0, 200),
    data,
    read: false,
    createdAt: new Date().toISOString(),
  });
  await client.lpush(NOTIF_KEY(riderId), entry);
  await client.ltrim(NOTIF_KEY(riderId), 0, 49); // keep last 50
};

const getNotificationHistory = async (riderId, limit = 20) => {
  const client = require('../../config/redis').getRedisClient();
  const raw = await client.lrange(NOTIF_KEY(riderId), 0, limit - 1);
  return raw.map((r) => {
    try { return JSON.parse(r); } catch { return null; }
  }).filter(Boolean);
};

const markNotificationsRead = async (riderId) => {
  const history = await getNotificationHistory(riderId, 50);
  const client = require('../../config/redis').getRedisClient();
  await client.del(NOTIF_KEY(riderId));
  for (const n of history) {
    n.read = true;
    await client.rpush(NOTIF_KEY(riderId), JSON.stringify(n));
  }
};

module.exports = {
  getCommunityStats,
  getLoyaltyPoolStats,
  contributeToPool,
  getWalletBalance,
  redeemWalletBalance,
  applyReferralCode,
  getReferralStats,
  saveNotificationToHistory,
  getNotificationHistory,
  markNotificationsRead,
};
