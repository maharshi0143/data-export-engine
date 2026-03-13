'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../utils/config');

const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
  },
});

// Stricter limiter for the heavy benchmark endpoint
const benchmarkLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Benchmark is resource-intensive. Please wait before retrying.',
  },
});

module.exports = { generalLimiter, benchmarkLimiter };
