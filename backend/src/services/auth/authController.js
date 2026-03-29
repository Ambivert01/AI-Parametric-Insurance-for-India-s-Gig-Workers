const authService = require('./authService');
const { sendSuccess, sendCreated, sendError } = require('../../utils/response');

const sendOTP = async (req, res, next) => {
  try {
    const result = await authService.sendOTP(req.body.phone);
    return sendSuccess(res, result, 200, { message: 'OTP sent successfully' });
  } catch (err) { next(err); }
};

const verifyOTP = async (req, res, next) => {
  try {
    const deviceData = {
      ...req.body.deviceData,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    const result = await authService.verifyOTP(req.body.phone, req.body.otp, deviceData);
    return sendSuccess(res, result, result.user.isNewUser ? 201 : 200);
  } catch (err) { next(err); }
};

const refreshToken = async (req, res, next) => {
  try {
    const result = await authService.refreshAccessToken(req.body.refreshToken);
    return sendSuccess(res, result);
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.token, req.user._id.toString());
    return sendSuccess(res, null, 200);
  } catch (err) { next(err); }
};

const completeOnboarding = async (req, res, next) => {
  try {
    const user = await authService.completeOnboarding(req.user._id.toString(), req.body);
    return sendSuccess(res, { user }, 200);
  } catch (err) { next(err); }
};

const getMe = async (req, res, next) => {
  try {
    return sendSuccess(res, { user: req.user });
  } catch (err) { next(err); }
};

module.exports = { sendOTP, verifyOTP, refreshToken, logout, completeOnboarding, getMe };
