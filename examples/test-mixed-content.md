# Software Development Guide

## Database Configuration

Here's how to set up the production database:

```bash
export DATABASE_URL="postgresql://admin:[REDACTED-PASSWORD]@prod-db.company.com:5432/maindb"
export REDIS_URL="redis://:[REDACTED-PASSWORD]@cache.company.com:6379"
```

## API Keys for Development

```javascript
const config = {
  openaiKey: "sk-proj-[REDACTED-OPENAI-KEY]",
  stripeKey: "sk_live_[REDACTED-STRIPE-KEY]",
  twilioSid: "AC[REDACTED-TWILIO-SID]",
  twilioToken: "auth_token_[REDACTED-TWILIO-TOKEN]"
};
```

This is regular documentation content mixed with secrets that should be detected.
