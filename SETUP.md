# Terminal Invoicing CLI - Quick Setup Guide

## Installation

1. **Extract and navigate**:
   ```bash
   cd terminal-invoicing
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Link globally** (optional, makes `Terminal Invoicing` command available everywhere):
   ```bash
   npm link
   ```
   
   Or run directly:
   ```bash
   node bin/terminv.js
   ```

## First-Time Setup

1. **Initialize Terminal Invoicing**:
   ```bash
   Terminal Invoicing init
   ```
   
   This wizard will ask for:
   - Company name and address
   - Company email
   - Logo path (optional, place logo in `assets/`)
   - Starting invoice number
   - Mailgun API key and domain

2. **Add your Mailgun credentials**:
   - Get API key from: https://app.mailgun.com/app/account/security/api_keys
   - Get domain from: https://app.mailgun.com/app/sending/domains
   - Use format: `mg.yourdomain.com` for domain

## Add Your Data

3. **Add Your Customer**:
   ```bash
   terminv customer add
   ```
   
4. **Add hosting service items**:
   ```bash
   terminv item add
   ```
   
   Repeat for other services as needed.

5. **Add a thank you note** (optional comment item):
   ```bash
   terminv item add
   ```
   - ID: `thank-you`
   - Type: `comment`
   - Description: `Thank you for your continued business!`

6. **Create recurring invoice**:
   ```bash
   terminv invoice create
   ```
   
## Test Your Invoice

7. **Generate a preview**:
   ```bash
   terminv invoice generate invoice_id --dry-run --preview
   ```
   
   This will:
   - Generate a PDF (without incrementing invoice number)
   - Open it in your default PDF viewer
   - NOT send any email

8. **Send a test email**:
   ```bash
   terminv email test youremail@example.com
   ```

## Setup Automation

9. **Enable automatic monthly sending**:
   ```bash
   terminv schedule setup
   ```
   
   This creates cron jobs that will automatically:
   - Generate the invoice on the 1st of each month at 9:00 AM
   - Send it via email
   - Archive everything in `history/`
   - Log to `~/.terminal_invoicing/logs/cron.log`

10. **Verify cron is set up**:
    ```bash
    terminv schedule list
    ```

## Manual Operations

Generate and send invoice manually:
```bash
terminv invoice generate invoice_id
```

Generate without sending:
```bash
terminv invoice generate invoice_id --no-send
```

View invoice history:
```bash
terminv history list
```

## Directory Structure After Setup

```
terminal-invoicing/
├── config/
│   ├── company.yaml         # Your company info
│   ├── email.yaml           # Mailgun config (sensitive!)
│   ├── email-template.yaml  # Email template
│   ├── invoice-template.yaml # PDF styling
│   └── state.yaml          # Current invoice number
├── customers/
│   └── customer-a.yaml   # Your customer
├── items/
│   ├── item-001.yaml    # Your services
│   └── thank-you.yaml      # Comment items
├── invoices/
│   └── example-monthly.yaml    # Invoice definition
├── history/
│   └── 2025-12/            # Monthly archives
│       └── INV-178.zip     # Complete invoice archive
└── assets/
    └── logo.png            # Your logo (if provided)
```

## Troubleshooting

### Logo not showing
- Place logo at `assets/logo.png`
- Update `config/company.yaml` if using different path
- Logo should be PNG or JPEG

### Email not sending
1. Test configuration: `terminv email test`
2. Check Mailgun dashboard for delivery logs
3. Verify domain is verified in Mailgun
4. Check logs: `tail -f ~/.terminal_invoicing/logs/error.log`

### Cron not running
1. Verify cron is installed: `which crontab`
2. Check crontab: `crontab -l | grep Terminal Invoicing`
3. Check logs: `tail -f ~/.terminal_invoicing/logs/cron.log`
4. Re-setup: `Terminal Invoicing schedule setup`

### Invoice number issues
- State is tracked in `config/state.yaml`
- Current number is `next_invoice_number`
- Edit this file to adjust if needed

## Next Steps

- Customize email template: `config/email-template.yaml`
- Adjust PDF styling: `config/invoice-template.yaml`
- Add more customers: `terminv customer add`
- Create more invoices: `terminv invoice create`
- View all commands: `terminv --help`

## Support

For issues or questions:
- Check logs: `~/.terminal_invoicing/logs/`
- Read docs: `README.md`
- Review examples: `examples/`

---

Built with ❤️ for small businesses by Jason Phillips / Jaypee Softworks
