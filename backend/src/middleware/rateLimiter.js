const rateLimit = require('express-rate-limit');

// Shared limiter for login, registration, and other session-backed account-mutation endpoints.
// 10 attempts per 15-minute window per IP; standard retry-after headers are sent.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in 15 minutes' },
});

// Stricter, independent limiter for the forgot-password / reset-password pair. These routes are
// deliberately public — no session and no known password required to call them — which makes
// them a more attractive target for account-enumeration or token-guessing attempts than routes
// that also require proving a password. A tighter, separate budget (rather than sharing
// loginLimiter's more permissive one) means throttling one doesn't cost budget on the other.
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in an hour' },
});

module.exports = { loginLimiter, passwordResetLimiter };
