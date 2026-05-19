const SMTPServer = require('smtp-server').SMTPServer;
const simpleParser = require('mailparser').simpleParser;
const db = require('./database');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const MAX_CONNECTIONS_PER_IP = 10;
const MAX_MESSAGE_SIZE = 5 * 1024 * 1024; // 5MB
const CONNECTION_TIMEOUT = 30000; // 30 seconds

const connectionCounts = new Map();

function sanitizeHTML(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                   'ul', 'ol', 'li', 'a', 'img', 'div', 'span', 'table', 'tr', 'td', 'th',
                   'blockquote', 'pre', 'code', 'hr', 'font', 'center', 'b', 'i'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'class', 'id', 'width', 'height', 'color', 'face', 'size'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SANITIZE_DOM: true
  });
}

function createSMTPServer() {
  const server = new SMTPServer({
    disabledCommands: ['AUTH'],
    size: MAX_MESSAGE_SIZE,
    socketTimeout: CONNECTION_TIMEOUT,
    maxClients: 50,
    onConnect(session, callback) {
      const ip = session.remoteAddress;
      const count = (connectionCounts.get(ip) || 0) + 1;
      connectionCounts.set(ip, count);
      
      if (count > MAX_CONNECTIONS_PER_IP) {
        return callback(new Error('Too many connections from this IP'));
      }
      
      console.log('SMTP client connected:', session.remoteAddress);
      return callback();
    },
    onClose(session) {
      const ip = session.remoteAddress;
      const count = (connectionCounts.get(ip) || 1) - 1;
      if (count <= 0) {
        connectionCounts.delete(ip);
      } else {
        connectionCounts.set(ip, count);
      }
    },
    onMailFrom(address, session, callback) {
      if (!address.address) {
        return callback(new Error('Invalid sender address'));
      }
      return callback();
    },
    onRcptTo(recipient, session, callback) {
      const domain = process.env.DOMAIN || 'vitsmail.sryze.cc';
      if (!recipient.address.endsWith('@' + domain)) {
        return callback(new Error('Invalid recipient domain'));
      }
      const address = recipient.address.toLowerCase();
      if (!db.mailboxExists(address)) {
        db.createMailbox(address);
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
        const fromAddress = mail.from?.text || mail.from?.address || 'unknown';
        
        for (const recipient of recipients) {
          const address = recipient.address.toLowerCase();
          db.addEmail(address, {
            from: fromAddress,
            subject: mail.subject || '(no subject)',
            text: mail.text || '',
            html: sanitizeHTML(mail.html)
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