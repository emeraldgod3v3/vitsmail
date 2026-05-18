# Disposable Temporary Email Service - Design Spec

## Project Overview

- **Project name**: vitsmail
- **Type**: Web application with SMTP server
- **Core functionality**: Secure disposable temporary email service with 30-minute expiration
- **Target users**: Privacy-conscious users needing temporary email for signups/verification

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   User      │───▶│  Express    │───▶│  In-memory  │
│   Browser   │    │  Web API    │    │  Store      │
└─────────────┘    └─────────────┘    └─────────────┘
                          │
                   ┌──────┴──────┐
                   │ SMTP Server │
                   │ (port 25)   │
                   └─────────────┘
```

## Components

### 1. Web Server (Express + Helmet)
- Serve static frontend
- REST API endpoints for email management
- Full security middleware stack
- Port: 3000 (HTTP)

### 2. SMTP Server (smtp-server)
- Listen on port 25 for incoming emails
- Parse incoming mail with mailparser
- Store parsed emails in memory
- Port: 25

### 3. In-Memory Store
- Map of `emailAddress -> { emails: [], createdAt, expiresAt }`
- Auto-cleanup of expired mailboxes every minute
- 30-minute expiration from mailbox creation

### 4. Frontend
- Single-page app for viewing/receiving emails
- Generate random or custom email addresses
- Real-time email updates via polling

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mailbox` | Create new mailbox |
| GET | `/api/mailbox/:address` | Get emails for address |
| GET | `/api/mailbox/:address/exists` | Check if mailbox exists |
| DELETE | `/api/mailbox/:address` | Delete mailbox |

## Security Features

1. **Helmet** - Secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
2. **Rate Limiting** - Per-IP request limiting (100 req/15min)
3. **CSRF Protection** - Token-based CSRF middleware
4. **Input Validation** - Strict email address validation with regex
5. **XSS Protection** - Sanitize all user inputs and outputs
6. **No Sensitive Logging** - Never log email contents or sensitive data
7. **Secure Session** - HttpOnly cookies, secure flags in production

## Data Model

```javascript
{
  address: "user@vitsmail.sryze.cc",
  createdAt: timestamp,
  expiresAt: timestamp, // createdAt + 30 minutes
  emails: [
    {
      id: uuid,
      from: "sender@example.com",
      subject: "Email subject",
      text: "Plain text body",
      html: "HTML body",
      receivedAt: timestamp
    }
  ]
}
```

## Email Address Format

- Random: `{random}@vitsmail.sryze.cc` (e.g., `x7k9m2@vitsmail.sryze.cc`)
- Custom: `{username}@vitsmail.sryze.cc`

## Cleanup Strategy

- Background job runs every 60 seconds
- Removes all mailboxes where `expiresAt < Date.now()`
- No manual deletion needed - automatic expiration

## DNS Requirements

- MX record: `vitsmail.sryze.cc` -> `{server-ip}`
- A record for SMTP connectivity

## Acceptance Criteria

1. Users can create random or custom email addresses
2. Emails sent to temporary addresses are received and displayed
3. All mailboxes auto-expire after 30 minutes
4. Full security headers applied via Helmet
5. Rate limiting prevents abuse
6. Input validation prevents injection attacks
7. No sensitive data logged
8. Frontend displays emails in real-time