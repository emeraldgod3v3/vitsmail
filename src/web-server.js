const express = require('express');
const path = require('path');
const store = require('./store');
const security = require('./middleware/security');

function createWebServer() {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(security.helmet);
  app.use('/api', security.apiLimiter);
  
  app.use(express.static(path.join(__dirname, '../public')));
  
  app.post('/api/mailbox', security.createMailboxLimiter, (req, res) => {
    try {
      let { address } = req.body;
      
      if (!address) {
        const random = Math.random().toString(36).substring(2, 10);
        const domain = process.env.DOMAIN || 'vitsmail.sryze.cc';
        address = `${random}@${domain}`;
      } else {
        address = address.toLowerCase().trim();
      }
      
      if (!security.validateEmailAddress(address)) {
        return res.status(400).json({ error: 'Invalid email address format' });
      }
      
      const mailbox = store.createMailbox(address);
      res.status(201).json({
        address: mailbox.address,
        expiresAt: mailbox.expiresAt
      });
    } catch (error) {
      console.error('Create mailbox error:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  app.get('/api/mailbox/:address', (req, res) => {
    try {
      const address = req.params.address.toLowerCase();
      
      if (!security.validateEmailAddress(address)) {
        return res.status(400).json({ error: 'Invalid email address format' });
      }
      
      const mailbox = store.getMailbox(address);
      if (!mailbox) {
        return res.status(404).json({ error: 'Mailbox not found or expired' });
      }
      
      const emails = store.getEmails(address).map(email => ({
        id: email.id,
        from: security.sanitizeInput(email.from),
        subject: security.sanitizeInput(email.subject),
        text: security.sanitizeInput(email.text),
        html: security.sanitizeInput(email.html),
        receivedAt: email.receivedAt
      }));
      
      res.json({
        address: mailbox.address,
        expiresAt: mailbox.expiresAt,
        emails
      });
    } catch (error) {
      console.error('Get mailbox error:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  app.get('/api/mailbox/:address/exists', (req, res) => {
    try {
      const address = req.params.address.toLowerCase();
      
      if (!security.validateEmailAddress(address)) {
        return res.status(400).json({ error: 'Invalid email address format' });
      }
      
      const exists = store.mailboxExists(address);
      res.json({ exists });
    } catch (error) {
      console.error('Check mailbox error:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  app.delete('/api/mailbox/:address', (req, res) => {
    try {
      const address = req.params.address.toLowerCase();
      
      if (!security.validateEmailAddress(address)) {
        return res.status(400).json({ error: 'Invalid email address format' });
      }
      
      const deleted = store.deleteMailbox(address);
      res.json({ success: deleted });
    } catch (error) {
      console.error('Delete mailbox error:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  return app;
}

module.exports = { createWebServer };