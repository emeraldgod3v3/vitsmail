# Disposable Temporary Email Service - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure disposable temporary email service with 30-minute expiration, SMTP reception, and full security features

**Architecture:** Node.js with Express serving frontend + custom SMTP server on port 25. In-memory storage with automatic 30-minute expiration and background cleanup.

**Tech Stack:** Node.js, Express, smtp-server, mailparser, helmet, express-rate-limit, uuid

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "vitsmail",
  "version": "1.0.0",
  "description": "Secure disposable temporary email service",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "smtp-server": "^3.13.0",
    "mailparser": "^3.6.9",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "uuid": "^9.0.1",
    "dompurify": "^3.0.8",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 2: Create .env.example**

```
PORT=3000
SMTP_PORT=25
DOMAIN=vitsmail.sryze.cc
NODE_ENV=development
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`

- [ ] **Step 4: Commit**

```bash
git add package.json .env.example
git commit -m "chore: project setup with dependencies"
```

---

## Task 2: In-Memory Store

**Files:**
- Create: `src/store.js`

- [ ] **Step 1: Create src/store.js**

```javascript
const { v4: uuidv4 } = require('uuid');

const MAILBOX_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds

class InMemoryStore {
  constructor() {
    this.mailboxes = new Map();
    this.cleanupInterval = null;
  }

  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [address, mailbox] of this.mailboxes.entries()) {
      if (mailbox.expiresAt < now) {
        this.mailboxes.delete(address);
      }
    }
  }

  createMailbox(address) {
    const now = Date.now();
    this.mailboxes.set(address, {
      address,
      createdAt: now,
      expiresAt: now + MAILBOX_EXPIRY_MS,
      emails: []
    });
    return this.getMailbox(address);
  }

  getMailbox(address) {
    const mailbox = this.mailboxes.get(address);
    if (!mailbox) return null;
    if (mailbox.expiresAt < Date.now()) {
      this.mailboxes.delete(address);
      return null;
    }
    return mailbox;
  }

  mailboxExists(address) {
    return this.getMailbox(address) !== null;
  }

  addEmail(address, email) {
    const mailbox = this.getMailbox(address);
    if (!mailbox) return null;
    
    const newEmail = {
      id: uuidv4(),
      from: email.from,
      subject: email.subject,
      text: email.text,
      html: email.html,
      receivedAt: Date.now()
    };
    
    mailbox.emails.push(newEmail);
    return newEmail;
  }

  getEmails(address) {
    const mailbox = this.getMailbox(address);
    if (!mailbox) return [];
    return mailbox.emails;
  }

  deleteMailbox(address) {
    return this.mailboxes.delete(address);
  }
}

module.exports = new InMemoryStore();
```

- [ ] **Step 2: Commit**

```bash
git add src/store.js
git commit -m "feat: add in-memory store with auto-cleanup"
```

---

## Task 3: Security Middleware

**Files:**
- Create: `src/middleware/security.js`

- [ ] **Step 1: Create src/middleware/security.js**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/security.js
git commit -m "feat: add security middleware (helmet, rate-limit, sanitization)"
```

---

## Task 4: SMTP Server

**Files:**
- Create: `src/smtp-server.js`

- [ ] **Step 1: Create src/smtp-server.js**

```javascript
const SMTPServer = require('smtp-server').SMTPServer;
const simpleParser = require('mailparser').simpleParser;
const store = require('./store');

function createSMTPServer() {
  const server = new SMTPServer({
    disabledCommands: ['AUTH'],
    onConnect(session, callback) {
      console.log('SMTP client connected:', session.id);
      return callback();
    },
    onMailFrom(address, session, callback) {
      const domain = process.env.DOMAIN || 'vitsmail.sryze.cc';
      if (!address.address.endsWith('@' + domain)) {
        return callback(new Error('Invalid recipient domain'));
      }
      return callback();
    },
    onRcptTo(recipient, session, callback) {
      const domain = process.env.DOMAIN || 'vitsmail.sryze.cc';
      if (!recipient.address.endsWith('@' + domain)) {
        return callback(new Error('Invalid recipient domain'));
      }
      const address = recipient.address.toLowerCase();
      if (!store.mailboxExists(address)) {
        store.createMailbox(address);
      }
      return callback();
    },
    onData(stream, session, callback) {
      simpleParser(stream, (err, mail) => {
        if (err) {
          console.error('Mail parsing error:', err.message);
          return callback(err);
        }
        
        const recipients = session.envelope.rcptTo;
        for (const recipient of recipients) {
          const address = recipient.address.toLowerCase();
          store.addEmail(address, {
            from: mail.from?.address || 'unknown',
            subject: mail.subject || '(no subject)',
            text: mail.text,
            html: mail.html
          });
        }
        
        console.log('Email received for:', recipients.map(r => r.address).join(', '));
        return callback();
      });
    }
  });

  return server;
}

module.exports = { createSMTPServer };
```

- [ ] **Step 2: Commit**

```bash
git add src/smtp-server.js
git commit -m "feat: add SMTP server for receiving emails"
```

---

## Task 5: Web Server with API

**Files:**
- Create: `src/web-server.js`

- [ ] **Step 1: Create src/web-server.js**

```javascript
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
        text: email.text,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/web-server.js
git commit -m "feat: add Express web server with REST API"
```

---

## Task 6: Main Entry Point

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: Create src/index.js**

```javascript
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

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  store.stopCleanup();
  smtpServer.close();
  process.exit(0);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/index.js
git commit -m "feat: add main entry point with server initialization"
```

---

## Task 7: Frontend

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`

- [ ] **Step 1: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>vitsmail - Secure Disposable Email</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>🔒 vitsmail</h1>
      <p class="tagline">Secure disposable email - 30 minute expiry</p>
    </header>
    
    <main>
      <section class="create-mailbox">
        <h2>Create Temporary Email</h2>
        <div class="create-options">
          <button id="random-btn" class="btn primary">Generate Random Address</button>
          <div class="custom-option">
            <input type="text" id="custom-username" placeholder="username">
            <span class="domain">@vitsmail.sryze.cc</span>
            <button id="custom-btn" class="btn secondary">Create Custom</button>
          </div>
        </div>
      </section>
      
      <section class="mailbox-view hidden" id="mailbox-section">
        <div class="mailbox-header">
          <h3>Your Temporary Email</h3>
          <div class="mailbox-address">
            <span id="display-address"></span>
            <button id="copy-btn" class="btn small">Copy</button>
            <button id="delete-btn" class="btn small danger">Delete</button>
          </div>
          <p class="expiry">Expires in: <span id="expiry-time"></span></p>
        </div>
        
        <div class="emails-list" id="emails-list">
          <p class="empty-state">No emails yet. Waiting for incoming mail...</p>
        </div>
      </section>
      
      <section class="email-detail hidden" id="email-detail">
        <button id="back-btn" class="btn small">← Back</button>
        <div class="email-content">
          <div class="email-header">
            <h3 id="email-subject"></h3>
            <p class="email-meta">From: <span id="email-from"></span></p>
            <p class="email-meta">Received: <span id="email-time"></span></p>
          </div>
          <div class="email-body" id="email-body"></div>
        </div>
      </section>
    </main>
    
    <footer>
      <p>All emails automatically expire after 30 minutes</p>
    </footer>
  </div>
  
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/style.css**

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  min-height: 100vh;
  color: #e4e4e4;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

header {
  text-align: center;
  padding: 40px 0;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
}

.tagline {
  color: #888;
}

main {
  background: #0f0f1a;
  border-radius: 12px;
  padding: 30px;
}

section {
  margin-bottom: 30px;
}

h2, h3 {
  margin-bottom: 15px;
  color: #fff;
}

.create-options {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.custom-option {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

input {
  padding: 12px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #1a1a2e;
  color: #e4e4e4;
  font-size: 1rem;
}

input:focus {
  outline: none;
  border-color: #4a9eff;
}

.domain {
  color: #888;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.btn.primary {
  background: #4a9eff;
  color: #fff;
}

.btn.primary:hover {
  background: #3a8eef;
}

.btn.secondary {
  background: #333;
  color: #e4e4e4;
}

.btn.secondary:hover {
  background: #444;
}

.btn.small {
  padding: 8px 16px;
  font-size: 0.9rem;
}

.btn.danger {
  background: #ff4757;
  color: #fff;
}

.btn.danger:hover {
  background: #e63950;
}

.hidden {
  display: none;
}

.mailbox-header {
  background: #1a1a2e;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.mailbox-address {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
  flex-wrap: wrap;
}

#display-address {
  font-size: 1.2rem;
  font-weight: bold;
  color: #4a9eff;
}

.expiry {
  color: #888;
  font-size: 0.9rem;
}

.empty-state {
  text-align: center;
  color: #666;
  padding: 40px;
}

.email-item {
  background: #1a1a2e;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: background 0.2s;
}

.email-item:hover {
  background: #252540;
}

.email-item h4 {
  margin-bottom: 5px;
}

.email-item .meta {
  font-size: 0.85rem;
  color: #888;
}

.email-content {
  background: #1a1a2e;
  padding: 20px;
  border-radius: 8px;
}

.email-header {
  border-bottom: 1px solid #333;
  padding-bottom: 15px;
  margin-bottom: 15px;
}

.email-header h3 {
  margin-bottom: 10px;
}

.email-meta {
  color: #888;
  font-size: 0.9rem;
  margin: 5px 0;
}

.email-body {
  line-height: 1.6;
  white-space: pre-wrap;
}

.email-body a {
  color: #4a9eff;
}

footer {
  text-align: center;
  padding: 20px;
  color: #666;
  font-size: 0.9rem;
}

@media (max-width: 600px) {
  .container {
    padding: 10px;
  }
  
  main {
    padding: 15px;
  }
  
  .custom-option {
    flex-direction: column;
    align-items: stretch;
  }
  
  .domain {
    text-align: center;
  }
}
```

- [ ] **Step 3: Create public/app.js**

```javascript
const DOMAIN = 'vitsmail.sryze.cc';

let currentAddress = null;
let expiryInterval = null;
let pollInterval = null;

function showSection(sectionId) {
  document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
  document.getElementById(sectionId).classList.remove('hidden');
}

function showMailboxView() {
  showSection('mailbox-section');
}

function showEmailDetail() {
  showSection('email-detail');
}

async function createMailbox(address) {
  try {
    const response = await fetch('/api/mailbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    });
    
    if (!response.ok) {
      const err = await response.json();
      alert(err.error || 'Failed to create mailbox');
      return;
    }
    
    const data = await response.json();
    currentAddress = data.address;
    document.getElementById('display-address').textContent = currentAddress;
    showMailboxView();
    startExpiryTimer(data.expiresAt);
    startPolling();
  } catch (error) {
    alert('Error creating mailbox: ' + error.message);
  }
}

function startExpiryTimer(expiresAt) {
  if (expiryInterval) clearInterval(expiryInterval);
  
  function update() {
    const remaining = Math.max(0, expiresAt - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    document.getElementById('expiry-time').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (remaining <= 0) {
      alert('Mailbox expired!');
      clearInterval(expiryInterval);
      clearInterval(pollInterval);
      currentAddress = null;
      showSection('create-mailbox');
    }
  }
  
  update();
  expiryInterval = setInterval(update, 1000);
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(fetchEmails, 3000);
  fetchEmails();
}

async function fetchEmails() {
  if (!currentAddress) return;
  
  try {
    const response = await fetch(`/api/mailbox/${encodeURIComponent(currentAddress)}`);
    
    if (response.status === 404) {
      alert('Mailbox expired or deleted');
      clearInterval(expiryInterval);
      clearInterval(pollInterval);
      currentAddress = null;
      showSection('create-mailbox');
      return;
    }
    
    const data = await response.json();
    renderEmails(data.emails);
    
    if (data.expiresAt !== document.getElementById('expiry-time').dataset.expiresAt) {
      startExpiryTimer(data.expiresAt);
    }
  } catch (error) {
    console.error('Error fetching emails:', error);
  }
}

function renderEmails(emails) {
  const container = document.getElementById('emails-list');
  
  if (!emails || emails.length === 0) {
    container.innerHTML = '<p class="empty-state">No emails yet. Waiting for incoming mail...</p>';
    return;
  }
  
  container.innerHTML = emails.map(email => `
    <div class="email-item" onclick="showEmail(${JSON.stringify(email).replace(/"/g, '&quot;')})">
      <h4>${escapeHtml(email.subject)}</h4>
      <p class="meta">From: ${escapeHtml(email.from)}</p>
      <p class="meta">${new Date(email.receivedAt).toLocaleString()}</p>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.showEmail = function(email) {
  document.getElementById('email-subject').textContent = email.subject;
  document.getElementById('email-from').textContent = email.from;
  document.getElementById('email-time').textContent = new Date(email.receivedAt).toLocaleString();
  
  const body = email.html || email.text || '';
  document.getElementById('email-body').textContent = body;
  
  showEmailDetail();
};

document.getElementById('random-btn').addEventListener('click', () => createMailbox(null));

document.getElementById('custom-btn').addEventListener('click', () => {
  const username = document.getElementById('custom-username').value.trim();
  if (!username) {
    alert('Please enter a username');
    return;
  }
  const address = `${username}@${DOMAIN}`;
  createMailbox(address);
});

document.getElementById('copy-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(currentAddress).then(() => {
    alert('Email address copied!');
  });
});

document.getElementById('delete-btn').addEventListener('click', async () => {
  if (!currentAddress) return;
  
  try {
    await fetch(`/api/mailbox/${encodeURIComponent(currentAddress)}`, { method: 'DELETE' });
    clearInterval(expiryInterval);
    clearInterval(pollInterval);
    currentAddress = null;
    showSection('create-mailbox');
  } catch (error) {
    alert('Error deleting mailbox: ' + error.message);
  }
});

document.getElementById('back-btn').addEventListener('click', showMailboxView);
```

- [ ] **Step 4: Commit**

```bash
git add public/
git commit -m "feat: add frontend (HTML, CSS, JS)"
```

---

## Task 8: DNS Configuration Guide

**Files:**
- Create: `DNS.md`

- [ ] **Step 1: Create DNS.md**

```markdown
# DNS Configuration for vitsmail.sryze.cc

## Required DNS Records

### MX Record (Required for receiving email)
| Type | Host | Value | Priority |
|------|------|-------|----------|
| MX | vitsmail.sryze.cc | your-server-ip | 10 |

### A Record (Required for SMTP)
| Type | Host | Value |
|------|------|-------|
| A | vitsmail.sryze.cc | your-server-ip |

## Setup with Cloudflare

1. Log in to Cloudflare
2. Select your domain
3. Go to DNS > Records
4. Add MX record:
   - Type: MX
   - Name: vitsmail
   - Content: your-server-ip
   - Priority: 10
5. Add A record:
   - Type: A
   - Name: vitsmail
   - Content: your-server-ip

## Testing

After DNS propagates (can take up to 24 hours), test with:

```bash
# Check MX record
dig MX vitsmail.sryze.cc

# Test SMTP (from another server)
nc -zv your-server-ip 25
```

## Troubleshooting

- Port 25 not working? Contact your VPS provider to open port 25
- Emails not received? Check firewall: `sudo ufw allow 25/tcp`
```

- [ ] **Step 2: Commit**

```bash
git add DNS.md
git commit -m "docs: add DNS configuration guide"
```

---

## Task 9: Verification

**Files:**
- Modify: `.env` (create from example)

- [ ] **Step 1: Create .env file**

Run: `cp .env.example .env`

- [ ] **Step 2: Verify the app runs**

Run: `npm start` (you should see both web and SMTP servers start)

- [ ] **Step 3: Test the web UI**

Open: `http://localhost:3000`

- [ ] **Step 4: Test API endpoints**

```bash
# Create random mailbox
curl -X POST http://localhost:3000/api/mailbox -H "Content-Type: application/json" -d '{}'

# Get emails (use address from previous response)
curl http://localhost:3000/api/mailbox/randomabc123@vitsmail.sryze.cc
```

- [ ] **Step 5: Commit final**

```bash
git add .env
git commit -m "chore: project complete and verified"
```

---

## Summary

This plan implements a complete secure disposable email service with:

1. **Project setup** - Node.js with all dependencies
2. **In-memory store** - Auto-cleanup of expired mailboxes every 60 seconds
3. **Security middleware** - Helmet, rate limiting, input sanitization
4. **SMTP server** - Receives emails on port 25 with mailparser
5. **Web server** - Express API with full CRUD for mailboxes
6. **Frontend** - Clean UI for creating and viewing emails
7. **DNS guide** - Documentation for MX/A records

All security requirements from the spec are met:
- Rate limiting (100 req/15min API, 10 mailboxes/min)
- CSRF handled via same-origin
- Secure headers via Helmet
- Input validation and sanitization
- No sensitive data logging