const { HTTP } = require('../config/constants');

/**
 * Standard response envelope for every API response.
 * { success, data, error, meta, timestamp }
 */

const sendSuccess = (res, data = null, statusCode = HTTP.OK, meta = {}) => {
  return res.status(statusCode).json({
    success: true,
    data,
    error: null,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
};

const sendError = (res, message, statusCode = HTTP.INTERNAL_ERROR, errors = null, meta = {}) => {
  return res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      message,
      errors,    // validation errors array if applicable
      code: statusCode,
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
};

const sendCreated = (res, data, meta = {}) =>
  sendSuccess(res, data, HTTP.CREATED, meta);

const sendNotFound = (res, resource = 'Resource') =>
  sendError(res, `${resource} not found`, HTTP.NOT_FOUND);

const sendUnauthorized = (res, message = 'Authentication required') =>
  sendError(res, message, HTTP.UNAUTHORIZED);

const sendForbidden = (res, message = 'Access denied') =>
  sendError(res, message, HTTP.FORBIDDEN);

const sendBadRequest = (res, message, errors = null) =>
  sendError(res, message, HTTP.BAD_REQUEST, errors);

const sendConflict = (res, message) =>
  sendError(res, message, HTTP.CONFLICT);

const sendTooManyRequests = (res, message = 'Too many requests. Please slow down.') =>
  sendError(res, message, HTTP.TOO_MANY_REQUESTS);

const sendPaginated = (res, items, total, page, limit, meta = {}) => {
  const totalPages = Math.ceil(total / limit);
  return sendSuccess(res, items, HTTP.OK, {
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    ...meta,
  });
};

module.exports = {
  sendSuccess, sendError, sendCreated, sendNotFound,
  sendUnauthorized, sendForbidden, sendBadRequest,
  sendConflict, sendTooManyRequests, sendPaginated,
};
