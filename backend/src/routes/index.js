// ══════════════════════════════════════════════════════════
// routes/index.js — Master router (mounts all sub-routers)
// ══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();

router.use('/auth',        require('./auth.routes'));
router.use('/policies',    require('./policy.routes'));
router.use('/policies/shift', require('./extended.routes').shiftRouter);
router.use('/claims',      require('./claims.routes'));
router.use('/payments',    require('./payment.routes'));
router.use('/analytics',   require('./analytics.routes'));
router.use('/admin',       require('./admin.routes'));
router.use('/admin',       require('./extended.routes').adminExtRouter);
router.use('/webhooks',    require('./webhook.routes'));

// Extended routes
const ext = require('./extended.routes');
router.use('/community',      ext.communityRouter);
router.use('/wallet',         ext.walletRouter);
router.use('/referral',       ext.referralRouter);
router.use('/notifications',  ext.notificationsRouter);
router.use('/kyc',            ext.kycRouter);
router.use('/claims',         ext.claimsExtRouter);
router.use('/iot',            ext.iotRouter);
router.use('/public',         ext.publicRouter);

module.exports = router;
