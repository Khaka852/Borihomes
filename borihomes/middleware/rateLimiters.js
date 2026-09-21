const rateLimit = require('express-rate-limit');

// Applies to public forms anyone on the internet can submit (enquiries,
// inspection requests). Generous enough for a real visitor, tight enough to
// blunt a spam script: 10 submissions per 15 minutes per IP address.
const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this device. Please try again in a little while.' },
});

module.exports = { publicFormLimiter };
