const Joi = require('joi');
const { PLATFORMS, VEHICLE_TYPES, SHIFT_PATTERNS } = require('../../config/constants');

const phone = Joi.string()
  .pattern(/^[6-9]\d{9}$/)
  .required()
  .messages({ 'string.pattern.base': 'Enter a valid 10-digit Indian mobile number' });

const schemas = {
  sendOTP: Joi.object({ phone }),

  verifyOTP: Joi.object({
    phone,
    otp: Joi.string().length(6).pattern(/^\d+$/).required(),
    deviceData: Joi.object({
      deviceModel: Joi.string().max(100),
      os: Joi.string().valid('android', 'ios', 'web'),
      osVersion: Joi.string().max(20),
      appVersion: Joi.string().max(20),
      fcmToken: Joi.string().max(300),
      isMockLocation: Joi.boolean().default(false),
      hasMockApps: Joi.boolean().default(false),
      ipAddress: Joi.string().ip(),
      userAgent: Joi.string().max(500),
      screenRes: Joi.string().max(20),
      timezone: Joi.string().max(50),
    }).default({}),
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required(),
  }),

  completeOnboarding: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    language: Joi.string().valid('hi', 'en', 'mr', 'ta', 'te', 'kn', 'bn').default('hi'),
    platform: Joi.string().valid(...Object.values(PLATFORMS)).required(),
    vehicleType: Joi.string().valid(...Object.values(VEHICLE_TYPES)).required(),
    shiftPattern: Joi.string().valid(...Object.values(SHIFT_PATTERNS)).required(),
    declaredDailyIncome: Joi.number().min(100).max(5000).required(),
    cityId: Joi.string().required(),
    pincode: Joi.string().pattern(/^\d{6}$/).optional(),
    zone: Joi.string().max(100).optional(),
    notificationPrefs: Joi.object({
      whatsapp: Joi.boolean().default(true),
      sms: Joi.boolean().default(true),
      push: Joi.boolean().default(true),
      email: Joi.boolean().default(false),
    }).default({}),
  }),
};

module.exports = schemas;
