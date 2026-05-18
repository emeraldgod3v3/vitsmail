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