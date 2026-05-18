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