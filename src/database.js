const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'vitsmail.db');
const MAILBOX_EXPIRY_MS = 30 * 60 * 1000;

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

class DatabaseManager {
  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initTables();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mailboxes (
        address TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        mailbox_address TEXT NOT NULL,
        from_address TEXT NOT NULL,
        subject TEXT NOT NULL,
        text_body TEXT,
        html_body TEXT,
        received_at INTEGER NOT NULL,
        FOREIGN KEY (mailbox_address) REFERENCES mailboxes(address) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(mailbox_address);
      CREATE INDEX IF NOT EXISTS idx_mailboxes_expires ON mailboxes(expires_at);
    `);
  }

  cleanup() {
    const now = Date.now();
    const stmt = this.db.prepare('DELETE FROM mailboxes WHERE expires_at < ?');
    const result = stmt.run(now);
    return result.changes;
  }

  startCleanup(intervalMs = 60000) {
    this.cleanupInterval = setInterval(() => {
      const deleted = this.cleanup();
      if (deleted > 0) console.log(`Cleaned up ${deleted} expired mailboxes`);
    }, intervalMs);
  }

  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  createMailbox(address) {
    const now = Date.now();
    try {
      this.db.prepare('INSERT OR REPLACE INTO mailboxes (address, created_at, expires_at) VALUES (?, ?, ?)').run(
        address, now, now + MAILBOX_EXPIRY_MS
      );
      return this.getMailbox(address);
    } catch (err) {
      console.error('Create mailbox error:', err.message);
      return null;
    }
  }

  getMailbox(address) {
    const mailbox = this.db.prepare('SELECT * FROM mailboxes WHERE address = ?').get(address);
    if (!mailbox) return null;
    if (mailbox.expires_at < Date.now()) {
      this.db.prepare('DELETE FROM mailboxes WHERE address = ?').run(address);
      return null;
    }
    return {
      address: mailbox.address,
      createdAt: mailbox.created_at,
      expiresAt: mailbox.expires_at
    };
  }

  mailboxExists(address) {
    return this.getMailbox(address) !== null;
  }

  addEmail(address, emailData) {
    const mailbox = this.getMailbox(address);
    if (!mailbox) return null;

    const id = uuidv4();
    try {
      this.db.prepare(`
        INSERT INTO emails (id, mailbox_address, from_address, subject, text_body, html_body, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, address, emailData.from, emailData.subject, emailData.text || '', emailData.html || '', Date.now()
      );
      return this.getEmailById(id);
    } catch (err) {
      console.error('Add email error:', err.message);
      return null;
    }
  }

  getEmailById(id) {
    const email = this.db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    if (!email) return null;
    return {
      id: email.id,
      from: email.from_address,
      subject: email.subject,
      text: email.text_body,
      html: email.html_body,
      receivedAt: email.received_at
    };
  }

  getEmails(address) {
    const mailbox = this.getMailbox(address);
    if (!mailbox) return [];

    const rows = this.db.prepare('SELECT * FROM emails WHERE mailbox_address = ? ORDER BY received_at ASC').all(address);
    return rows.map(row => ({
      id: row.id,
      from: row.from_address,
      subject: row.subject,
      text: row.text_body,
      html: row.html_body,
      receivedAt: row.received_at
    }));
  }

  deleteMailbox(address) {
    try {
      this.db.prepare('DELETE FROM emails WHERE mailbox_address = ?').run(address);
      const result = this.db.prepare('DELETE FROM mailboxes WHERE address = ?').run(address);
      return result.changes > 0;
    } catch (err) {
      console.error('Delete mailbox error:', err.message);
      return false;
    }
  }

  getStats() {
    const mailboxes = this.db.prepare('SELECT COUNT(*) as count FROM mailboxes').get();
    const emails = this.db.prepare('SELECT COUNT(*) as count FROM emails').get();
    const activeUsers = this.db.prepare('SELECT COUNT(*) as count FROM mailboxes WHERE created_at > ?').get(Date.now() - 120000);
    return {
      mailboxes: mailboxes.count,
      emails: emails.count,
      activeUsers: activeUsers.count
    };
  }

  close() {
    this.stopCleanup();
    this.db.close();
  }
}

module.exports = new DatabaseManager();