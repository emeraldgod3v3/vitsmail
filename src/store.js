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