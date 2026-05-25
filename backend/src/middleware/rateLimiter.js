const rateLimit = require('express-rate-limit');

// Shared limiter for all login and registration endpoints.
// 10 attempts per 15-minute window per IP; standard retry-after headers are sent.
module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in 15 minutes' },
});
