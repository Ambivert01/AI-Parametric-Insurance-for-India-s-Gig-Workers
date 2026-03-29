const express = require('express');
const router = express.Router();
const ctrl = require('../services/auth/authController');
const schemas = require('../services/auth/authValidation');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/index');
const { limiters } = require('../middleware/index');

// POST /api/v1/auth/otp/send
router.post('/otp/send',
  limiters.otpSend,
  validate(schemas.sendOTP),
  ctrl.sendOTP
);

// POST /api/v1/auth/otp/verify
router.post('/otp/verify',
  limiters.auth,
  validate(schemas.verifyOTP),
  ctrl.verifyOTP
);

// POST /api/v1/auth/refresh
router.post('/refresh',
  validate(schemas.refreshToken),
  ctrl.refreshToken
);

// POST /api/v1/auth/logout
router.post('/logout',
  authenticate,
  ctrl.logout
);

// GET /api/v1/auth/me
router.get('/me',
  authenticate,
  ctrl.getMe
);

// PUT /api/v1/auth/onboarding
router.put('/onboarding',
  authenticate,
  validate(schemas.completeOnboarding),
  ctrl.completeOnboarding
);

module.exports = router;
