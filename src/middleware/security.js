const helmet = require('helmet');

const helmetConfig = {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
  frameguard: { action: 'deny' },
  referrerPolicy: false,
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