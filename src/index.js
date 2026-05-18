require('dotenv').config();
const { createWebServer } = require('./web-server');
const { createSMTPServer } = require('./smtp-server');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const SMTP_PORT = process.env.SMTP_PORT || 25;

const app = createWebServer();
const smtpServer = createSMTPServer();

app.listen(PORT, () => {
  console.log(`Web server running on http://localhost:${PORT}`);
});

smtpServer.listen(SMTP_PORT, '0.0.0.0', () => {
  console.log(`SMTP server listening on port ${SMTP_PORT}`);
});

store.startCleanup();

function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  store.stopCleanup();
  smtpServer.close(() => {
    console.log('SMTP server closed');
  });
  app.close(() => {
    console.log('Web server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));