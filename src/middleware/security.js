const helmet = require('helmet');

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
  frameguard: { action: 'deny' },
  referrerPolicy: 'strict-origin-when-cross-origin',
};

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

function passthrough(req, res, next) { next(); }

module.exports = {
  helmet: helmet(helmetConfig),
  apiLimiter: passthrough,
  createMailboxLimiter: passthrough,
  validateEmailAddress,
  sanitizeInput
};