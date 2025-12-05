# Email Provider Plugins Guide

Email providers handle sending invoices via email. Terminal Invoicing ships with Mailgun support, but you can add support for other providers.

## Provider Structure

An email provider is a JavaScript module that exports an object with the following structure:

```javascript
const provider = {
  name: 'my-provider',                // Unique identifier
  description: 'Send via My Provider', // Human-readable description
  
  // Required: Send email
  async send(options, config) {
    // Send email and return delivery info
  },
  
  // Optional: Get delivery status
  async getDeliveryStatus(messageId, config) {
    // Query delivery status
  },
  
  // Optional: Test configuration
  async test(config) {
    // Validate configuration
  }
};

module.exports = provider;
```

## The Send Function

### Parameters

**options**:
```javascript
{
  to: string,              // Recipient email
  subject: string,         // Email subject
  body: string,            // Email body (plain text)
  from: string,            // Sender email
  attachments: [           // Array of attachments
    {
      path: string,        // Full path to file
      filename: string     // Attachment filename
    }
  ]
}
```

**config**: Provider-specific configuration from `config/email.yaml`

### Return Value

Must return an object with delivery information:

```javascript
{
  messageId: string,       // Provider's message ID
  status: 'sent' | 'queued' | 'failed',
  timestamp: string,       // ISO timestamp
  provider: string,        // Provider name
  to: string,             // Recipient
  subject: string,         // Email subject
  error: string           // Error message (if failed)
}
```

## Creating a Custom Provider

### 1. Create Provider File

```bash
touch email-providers/sendgrid.js
```

### 2. Implement Provider

```javascript
const sendgrid = require('@sendgrid/mail');

const provider = {
  name: 'sendgrid',
  description: 'Send emails via SendGrid',
  
  async send(options, config) {
    try {
      // Validate config
      if (!config.api_key) {
        throw new Error('SendGrid API key required');
      }
      
      // Initialize SendGrid
      sendgrid.setApiKey(config.api_key);
      
      // Prepare message
      const message = {
        to: options.to,
        from: options.from || config.from,
        subject: options.subject,
        text: options.body,
        attachments: options.attachments.map(att => ({
          content: require('fs').readFileSync(att.path).toString('base64'),
          filename: att.filename,
          type: 'application/pdf',
          disposition: 'attachment'
        }))
      };
      
      // Send
      const response = await sendgrid.send(message);
      
      return {
        messageId: response[0].headers['x-message-id'],
        status: 'sent',
        timestamp: new Date().toISOString(),
        provider: 'sendgrid',
        to: options.to,
        subject: options.subject
      };
      
    } catch (err) {
      return {
        messageId: null,
        status: 'failed',
        timestamp: new Date().toISOString(),
        provider: 'sendgrid',
        to: options.to,
        subject: options.subject,
        error: err.message
      };
    }
  },
  
  async test(config) {
    if (!config.api_key) {
      throw new Error('SendGrid API key required');
    }
    
    sendgrid.setApiKey(config.api_key);
    
    // Test API key validity
    // SendGrid doesn't have a direct validation endpoint,
    // so we'd try to send a test request
    return true;
  }
};

module.exports = provider;
```

### 3. Configure Provider

Add configuration to `config/email.yaml`:

```yaml
provider: "sendgrid"

sendgrid:
  api_key: "SG.xxxxxxxxxxxxx"
  from: "billing@yourcompany.com"

# Keep other providers for reference
# mailgun:
#   api_key: "key-xxxxx"
#   domain: "mg.yourcompany.com"
```

### 4. Install Dependencies

```bash
npm install @sendgrid/mail
```

## Example: SMTP Provider

Here's an example SMTP provider using nodemailer:

```javascript
const nodemailer = require('nodemailer');

const provider = {
  name: 'smtp',
  description: 'Send via SMTP',
  
  async send(options, config) {
    try {
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure || false,
        auth: {
          user: config.username,
          pass: config.password
        }
      });
      
      // Send mail
      const info = await transporter.sendMail({
        from: options.from || config.from,
        to: options.to,
        subject: options.subject,
        text: options.body,
        attachments: options.attachments.map(att => ({
          filename: att.filename,
          path: att.path
        }))
      });
      
      return {
        messageId: info.messageId,
        status: 'sent',
        timestamp: new Date().toISOString(),
        provider: 'smtp',
        to: options.to,
        subject: options.subject
      };
      
    } catch (err) {
      return {
        messageId: null,
        status: 'failed',
        timestamp: new Date().toISOString(),
        provider: 'smtp',
        to: options.to,
        subject: options.subject,
        error: err.message
      };
    }
  },
  
  async test(config) {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure || false,
      auth: {
        user: config.username,
        pass: config.password
      }
    });
    
    await transporter.verify();
    return true;
  }
};

module.exports = provider;
```

Configuration for SMTP:

```yaml
provider: "smtp"

smtp:
  host: "smtp.gmail.com"
  port: 587
  secure: false
  username: "your-email@gmail.com"
  password: "your-app-password"
  from: "billing@yourcompany.com"
```

## Testing Your Provider

```bash
# Test email configuration
Terminal Invoicing email test your-email@example.com

# List available providers
Terminal Invoicing email providers
```

## Best Practices

1. **Error Handling**: Always catch errors and return proper status
2. **Logging**: Use the logger for debugging: `require('../src/utils/logger')`
3. **Configuration**: Validate all required config fields
4. **Attachments**: Handle file reading errors gracefully
5. **Status**: Return accurate delivery status

## Troubleshooting

**Provider not found**: Ensure file is in `email-providers/` directory.

**Send failures**: Check `~/.Terminal Invoicing/logs/error.log` for details.

**Authentication errors**: Verify API keys and credentials in `config/email.yaml`.
