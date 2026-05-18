const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  referrerPolicy: 'strict-origin-when-cross-origin',
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const createMailboxLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many mailboxes created, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function validateEmailAddress(address) {
  if (!address || typeof address !== 'string') return false;
  const domain = process.env.DOMAIN || 'vitsmail.sryze.cc';
  const regex = new RegExp(`^[a-zA-Z0-9._%+-]+@${domain.replace('.', '\\.')}$`);
  return regex.test(address);
}

function sanitizeInput(input) {
  if (typeof input === 'string') {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
  return input;
}

module.exports = {
  helmet: helmet(helmetConfig),
  apiLimiter,
  createMailboxLimiter,
  validateEmailAddress,
  sanitizeInput
};