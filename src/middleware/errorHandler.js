'use strict';

const logger = require('../utils/logger');
const config = require('../utils/config');

function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
  });

  // Don't send headers if already sent (e.g., streaming error)
  if (res.headersSent) {
    return res.end();
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal Server Error' : err.message,
    message:
      config.server.env === 'development'
        ? err.message
        : 'An unexpected error occurred',
  });
}

module.exports = { errorHandler };
