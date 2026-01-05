# Terminal Invoicing CLI

Professional command-line invoicing system with automated recurring billing, built for small software development companies.

## Features

- 📄 **Professional PDF Generation** - Clean, customizable invoice layouts
- 📧 **Automated Email Delivery** - Mailgun integration with template support
- ⏰ **Cron Automation** - Set-it-and-forget-it recurring billing
- 📦 **File-Based Storage** - No database required, all data in YAML
- 🎨 **Plugin Architecture** - Extensible layouts and email providers
- 📚 **Complete Audit Trail** - Compressed archives of every invoice
- 🚀 **Simple & Maintainable** - Clean Node.js code, easy to customize

## Installation

### Prerequisites

- Node.js 18+ (LTS)
- npm or yarn
- cron (for automation)

### Install

```bash
git clone https://github.com/yourusername/terminal-invoicing.git
cd terminal-invoicing
npm install
npm link  # Optional: makes 'Terminal Invoicing' available globally
```

## Quick Start

export TERMINAL_INVOICING_ROOT=\path\to\data\folder

### 1. Initialize

```bash
Terminal Invoicing init
```

This interactive wizard will set up:
- Company information
- Email provider configuration
- Starting invoice number
- Directory structure

### 2. Add a Customer

```bash
Terminal Invoicing customer add
```

### 3. Add Items/Services

```bash
Terminal Invoicing item add
```

### 4. Create Recurring Invoice

```bash
Terminal Invoicing invoice create
```

### 5. Setup Automation

```bash
Terminal Invoicing schedule setup
```

## Command Reference

### Setup & Configuration

```bash
# Initialize Terminal Invoicing
Terminal Invoicing init

# Show current configuration
Terminal Invoicing config show

# Edit configuration files
Terminal Invoicing config edit
```

### Customer Management

```bash
# Add a new customer
Terminal Invoicing customer add

# List all customers
Terminal Invoicing customer list

# Show customer details
Terminal Invoicing customer show <customer-id>

# Edit customer
Terminal Invoicing customer edit <customer-id>

# Remove customer
Terminal Invoicing customer remove <customer-id>
```

### Item Management

```bash
# Add a new item
Terminal Invoicing item add

# List all items
Terminal Invoicing item list

# Show item details
Terminal Invoicing item show <item-id>

# Edit item
Terminal Invoicing item edit <item-id>

# Remove item
Terminal Invoicing item remove <item-id>
```

### Invoice Management

```bash
# Create recurring invoice definition
Terminal Invoicing invoice create

# List all invoices
Terminal Invoicing invoice list

# Show invoice details
Terminal Invoicing invoice show <invoice-id>

# Edit invoice
Terminal Invoicing invoice edit <invoice-id>

# Remove invoice
Terminal Invoicing invoice remove <invoice-id>

# Generate and send invoice manually
Terminal Invoicing invoice generate <invoice-id>

# Generate without sending (dry run)
Terminal Invoicing invoice generate <invoice-id> --dry-run

# Generate and preview
Terminal Invoicing invoice generate <invoice-id> --preview

# Save to specific location
Terminal Invoicing invoice generate <invoice-id> --output /path/to/invoice.pdf
```

### Schedule Management

```bash
# Setup cron jobs for all enabled invoices
Terminal Invoicing schedule setup

# Remove all cron jobs
Terminal Invoicing schedule remove

# List current schedule
Terminal Invoicing schedule list
```

### History & Archives

```bash
# List archived invoices
Terminal Invoicing history list

# Filter by month
Terminal Invoicing history list --month 2025-12

# Show invoice archive
Terminal Invoicing history show <invoice-number>

# Extract archive contents
Terminal Invoicing history export <invoice-number> <output-dir>
```

### Email Management

```bash
# Send test email
Terminal Invoicing email test

# Send to specific recipient
Terminal Invoicing email test recipient@example.com

# List available providers
Terminal Invoicing email providers
```

### Layout Management

```bash
# List available layouts
Terminal Invoicing layout list

# Show layout details
Terminal Invoicing layout show <layout-name>
```

## Configuration

### Directory Structure

```
terminal-invoicing/
├── config/              # Configuration files
│   ├── company.yaml
│   ├── email.yaml
│   ├── invoice-template.yaml
│   ├── email-template.yaml
│   └── state.yaml
├── customers/           # Customer definitions
├── items/               # Item/service definitions
├── invoices/            # Invoice definitions (recurring)
├── history/             # Invoice archives (YYYY-MM/INV-xxx.zip)
├── assets/              # Logos and other assets
└── layouts/             # Custom layout plugins
```

### Company Configuration

`config/company.yaml`:

```yaml
name: "Your Company Name"
info_lines:
  - "123 Main Street"
  - "City, State 12345"
  - "United States"
  - "555-123-4567"
logo_path: "assets/logo.png"
email: "billing@yourcompany.com"
```

### Email Configuration

`config/email.yaml`:

```yaml
provider: "mailgun"

mailgun:
  api_key: "key-xxxxxxxxxxxxx"
  domain: "mg.yourcompany.com"
  from: "billing@yourcompany.com"
```

### Email Template

`config/email-template.yaml`:

```yaml
subject: "Invoice {{invoice_number}} from {{company_name}}"

body: |
  Hello {{customer_name}},
  
  Please find attached invoice {{invoice_number}} for {{invoice_month}}.
  
  Invoice Total: ${{total_amount}}
  Due Date: {{due_date}}
  
  Thank you for your business!
  
  Best regards,
  {{company_name}}
```

Available template variables:
- `{{invoice_number}}` - Invoice number
- `{{company_name}}` - Company name
- `{{customer_name}}` - Customer name
- `{{invoice_month}}` - e.g., "December 2025"
- `{{total_amount}}` - Invoice total
- `{{due_date}}` - Payment due date
- `{{invoice_date}}` - Invoice date

## Creating Custom Layouts

Layouts are JavaScript plugins that define how invoices are rendered to PDF.

### Basic Layout Structure

Create a file in `layouts/my-layout.js`:

```javascript
const PDFDocument = require('pdfkit');

const layout = {
  name: 'my-layout',
  description: 'My custom invoice layout',
  author: 'Your Name',
  version: '1.0.0',
  
  render(doc, data, config) {
    // data.company - Company information
    // data.customer - Customer information
    // data.invoice - Invoice metadata (number, date, due_date)
    // data.items - Array of line items
    // data.totals - Totals (subtotal, tax, total)
    
    // Render your PDF here using PDFKit
    doc.fontSize(24).text('INVOICE', { align: 'right' });
    // ... more rendering code
  }
};

module.exports = layout;
```

See `layouts/default.js` for a complete example.

## Creating Email Provider Plugins

Add new email providers by creating plugins in `email-providers/`.

### Basic Provider Structure

Create a file in `email-providers/my-provider.js`:

```javascript
const provider = {
  name: 'my-provider',
  description: 'My email provider',
  
  async send(options, config) {
    // options.to - Recipient email
    // options.subject - Email subject
    // options.body - Email body
    // options.attachments - Array of {path, filename}
    
    // Send email using your provider's API
    
    return {
      messageId: 'msg-12345',
      status: 'sent',
      timestamp: new Date().toISOString(),
      provider: 'my-provider'
    };
  }
};

module.exports = provider;
```

## Automation

Terminal Invoicing uses cron for automated invoice generation.

### How It Works

1. Define recurring invoices with `schedule.day_of_month` and `schedule.enabled: true`
2. Run `Terminal Invoicing schedule setup` to create cron jobs
3. Invoices automatically generate and send on the specified day each month
4. Logs are saved to `~/.terminal_invoicing/logs/cron.log`

### Cron Schedule Format

Invoices run at 9:00 AM on the specified day:

```
0 9 1 * *  # 9:00 AM on the 1st of every month
```

## Archive Format

Each sent invoice creates a zip archive in `history/YYYY-MM/INV-<number>.zip`:

```
INV-178.zip
├── invoice.pdf           # Generated PDF
├── invoice-params.yaml   # Complete input data
└── delivery.yaml         # Email delivery details
```

This provides a complete audit trail of all invoices.

## Troubleshooting

### Cron jobs not running

1. Check cron is installed: `which crontab`
2. Verify jobs are added: `crontab -l | grep Terminal Invoicing`
3. Check cron logs: `tail -f ~/.terminal_invoicing/logs/cron.log`
4. Ensure binary path is correct in cron entries

### Email not sending

1. Test email configuration: `Terminal Invoicing email test`
2. Verify Mailgun API key and domain
3. Check `~/.terminal_invoicing/logs/error.log` for details

### PDF generation issues

1. Ensure logo file exists at specified path
2. Check item data is valid (no missing fields)
3. Review logs: `~/.terminal_invoicing/logs/combined.log`

## Development

### Project Structure

```
src/
├── commands/        # CLI command implementations
├── lib/             # Core business logic
│   ├── config-manager.js
│   ├── pdf-generator.js
│   ├── email-manager.js
│   ├── invoice-processor.js
│   ├── layout-manager.js
│   └── cron-manager.js
└── utils/           # Utility functions
    ├── validators.js
    ├── formatters.js
    ├── logger.js
    └── file-utils.js
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Test thoroughly
5. Commit: `git commit -am 'Add new feature'`
6. Push: `git push origin my-feature`
7. Create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

- Issues: https://github.com/yourusername/terminal-invoicing/issues

## Acknowledgments

Built with:
- [PDFKit](https://pdfkit.org/) - PDF generation
- [Commander](https://github.com/tj/commander.js) - CLI framework
- [Mailgun.js](https://github.com/mailgun/mailgun.js) - Email delivery
- [Inquirer](https://github.com/SBoudrias/Inquirer.js) - Interactive prompts
