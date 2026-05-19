require('dotenv').config();
const { createWebServer } = require('./web-server');
const { createSMTPServer } = require('./smtp-server');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;
const SMTP_PORT = process.env.SMTP_PORT || 25;
const SMTP_ENABLED = process.env.SMTP_ENABLED !== 'false';
const USE_HTTPS = process.env.USE_HTTPS === 'true';

const expressApp = createWebServer();

let webServer;

if (USE_HTTPS) {
  const https = require('https');
  const fs = require('fs');
  const httpsServer = https.createServer({
    key: fs.readFileSync('/etc/letsencrypt/live/vitsmail.sryze.cc/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/vitsmail.sryze.cc/fullchain.pem')
  }, expressApp);
  webServer = httpsServer.listen(HTTPS_PORT, () => {
    console.log(`Web server running on https://localhost:${HTTPS_PORT}`);
  });
} else {
  webServer = expressApp.listen(PORT, () => {
    console.log(`Web server running on http://localhost:${PORT}`);
  });
}

if (SMTP_ENABLED) {
  const smtpServer = createSMTPServer();
  
  smtpServer.on('error', (err) => {
    console.error('SMTP server error:', err.message);
  });

  smtpServer.listen(SMTP_PORT, '0.0.0.0', () => {
    console.log(`SMTP server listening on port ${SMTP_PORT}`);
  });
} else {
  console.log('SMTP server disabled (set SMTP_ENABLED=true to enable)');
}

store.startCleanup();

function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  store.stopCleanup();
  webServer.close(() => {
    console.log('Web server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));