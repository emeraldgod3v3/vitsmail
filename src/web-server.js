const express = require('express');
const path = require('path');
const db = require('./database');
const security = require('./middleware/security');

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://vitsmail.onrender.com',
  'https://vitsmail.sryze.cc'
];

function createWebServer() {
  const app = express();
  
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin) || !origin) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(security.helmet);
  
  app.use(express.static(path.join(__dirname, '../public')));
  
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/vitsmail')) {
      return next();
    }
    if (req.path.includes('..')) {
      return res.status(404).send('Not found');
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
  
  app.post('/api/mailbox', (req, res) => {
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
      
      const mailbox = db.createMailbox(address);
      if (!mailbox) {
        return res.status(500).json({ error: 'Failed to create mailbox' });
      }
      
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
      
      const mailbox = db.getMailbox(address);
      if (!mailbox) {
        return res.status(404).json({ error: 'Mailbox not found or expired' });
      }
      
      const emails = db.getEmails(address).map(email => ({
        id: email.id,
        from: security.sanitizeInput(email.from),
        subject: security.sanitizeInput(email.subject),
        text: security.sanitizeInput(email.text),
        html: email.html,
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
      
      const exists = db.mailboxExists(address);
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
      
      const deleted = db.deleteMailbox(address);
      res.json({ success: deleted });
    } catch (error) {
      console.error('Delete mailbox error:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  app.get('/vitsmail/delete/:address', (req, res) => {
    try {
      const address = req.params.address.toLowerCase();
      
      if (!security.validateEmailAddress(address)) {
        return res.status(400).json({ error: 'Invalid email address format' });
      }
      
      db.deleteMailbox(address);
      res.redirect('/');
    } catch (error) {
      console.error('Delete mailbox error:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  app.get('/vitsmail/mail/:address', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
  
  app.get('/vitsmail/mail/receipt/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
  
  return app;
}

module.exports = { createWebServer };