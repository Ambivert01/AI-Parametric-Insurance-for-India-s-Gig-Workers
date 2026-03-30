const Joi = require("joi");
const {
  PLATFORMS,
  VEHICLE_TYPES,
  SHIFT_PATTERNS,
  SUPPORTED_CITIES,
} = require("../../config/constants");


const normalizePhone = (phone) => {
  if (!phone) return phone;

  let p = String(phone).replace(/\D/g, "");

  if (p.startsWith("91") && p.length === 12) p = p.slice(2);

  if (p.length !== 10) return p; // Joi will reject later

  return p;
};

const phone = Joi.string()
  .custom((value, helpers) => {
    const normalized = normalizePhone(value);

    if (!/^[6-9]\d{9}$/.test(normalized))
      return helpers.error("string.pattern.base");

    return normalized;
  })
  .required()
  .messages({
    "string.pattern.base": "Enter valid Indian mobile number",
  });

const schemas = {
  sendOTP: Joi.object({ phone }),

  verifyOTP: Joi.object({
    phone,
    otp: Joi.string().length(6).pattern(/^\d+$/).required(),
    deviceData: Joi.object({
      deviceModel: Joi.string().max(100),

      os: Joi.string().valid("android", "ios", "web"),

      osVersion: Joi.string().max(20),

      appVersion: Joi.string().max(20),

      fcmToken: Joi.string().max(300),

      isMockLocation: Joi.boolean().default(false),

      hasMockApps: Joi.boolean().default(false),

      isRooted: Joi.boolean().default(false),

      isEmulator: Joi.boolean().default(false),

      batteryLevel: Joi.number().min(0).max(100),

      networkType: Joi.string().valid("wifi", "4g", "5g", "3g"),

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
    language: Joi.string()
      .valid("hi", "en", "mr", "ta", "te", "kn", "bn")
      .default("hi"),
    platform: Joi.string()
      .lowercase()
      .valid(...Object.values(PLATFORMS))
      .required(),
    vehicleType: Joi.string()
      .valid(...Object.values(VEHICLE_TYPES))
      .required(),
    shiftPattern: Joi.string()
      .valid(...Object.values(SHIFT_PATTERNS))
      .required(),
    declaredDailyIncome: Joi.number().min(100).max(5000).required(),
    cityId: Joi.string()
      .lowercase()
      .valid(...SUPPORTED_CITIES)
      .required()
      .messages({
        "any.only": "City currently unsupported",
      }),
    pincode: Joi.string()
      .pattern(/^\d{6}$/)
      .optional(),
    zone: Joi.string()
      .max(100)
      .regex(/^[a-zA-Z0-9_\-\s]+$/)
      .optional(),
    notificationPrefs: Joi.object({
      whatsapp: Joi.boolean().default(true),
      sms: Joi.boolean().default(true),
      push: Joi.boolean().default(true),
      email: Joi.boolean().default(false),
    }).default({}),
  }),
};

module.exports = {
  ...schemas,
  normalizePhone,
};
