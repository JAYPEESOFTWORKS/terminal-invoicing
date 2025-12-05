# Example Configurations

This directory contains example YAML files showing the proper format for all Terminal Invoicing data types.

## Company Configuration

See `company.example.yaml` for company information structure. This defines:
- Company name
- Address and contact information (flexible info_lines array)
- Logo path
- Billing email

## Customer Configuration

See `customer.example.yaml` for customer structure. Includes:
- Customer ID (unique identifier)
- Customer name
- Address and contact information
- Billing email
- Payment terms

## Item Configuration

See `item.example.yaml` for item/service structure. Three types:

### Service/Product Items
- ID, type, description
- Optional detail line (e.g., website URL)
- Quantity, rate, unit

### Comment Items
- Only require ID, type, and description
- Used for notes, thank you messages, etc.

## Invoice Configuration

See `invoice.example.yaml` for recurring invoice definition. Includes:
- Invoice ID and human-readable name
- Customer reference
- Item references
- Schedule configuration
- Optional layout overrides

## Usage

Copy these examples to get started:

```bash
# Copy company template
cp examples/company.example.yaml config/company.yaml

# Edit with your information
nano config/company.yaml
```

Or use the interactive commands:

```bash
# Interactive customer creation
terminv customer add

# Interactive item creation
terminv item add

# Interactive invoice creation
terminv invoice create
```

## Complete Example Workflow

1. **Initialize**:
   ```bash
   terminv init
   ```

2. **Add Customer** (using example as reference):
   ```bash
   terminv customer add
   # Enter: customer-001, Your Customer
   ```

3. **Add Service Items**:
   ```bash
   terminv item add
   
   
   terminv item add     
   ```

4. **Add Comment Item**:
   ```bash
   terminv item add
   # thank-you-note: comment, "Thank you for your continued business!"
   ```

5. **Create Recurring Invoice**:
   ```bash
   terminv invoice create   
   ```

6. **Test Generate**:
   ```bash
   terminv invoice generate recurring-client-a --dry-run --preview
   ```

7. **Setup Automation**:
   ```bash
   terminv schedule setup
   ```

Now your invoice will automatically generate and send on the 1st of each month!

## Field Notes

### info_lines Arrays

Both company and customer configurations use flexible `info_lines` arrays. You can include:
- Street address
- City, State, ZIP
- Country
- Phone numbers
- Email addresses (additional to billing_email)
- Any other contact information

Example:
```yaml
info_lines:
  - "123 West St"
  - "City, ST Zip"
  - "United States"
  - "Phone: xxx"
  - "Email: xxx"
```

### Item Details

The `detail` field on items is optional and appears as a second line under the description:

```yaml
description: "Website Hosting"
detail: "www.yoursite.com"
```

This renders as:
```
Website Hosting
www.yoursite.com
```

### Schedule Configuration

The `day_of_month` field accepts 1-31. For months with fewer days, cron will run on the last available day:
- `day_of_month: 31` will run on Feb 28/29, Apr 30, Jun 30, etc.

### Layout Overrides

You can customize the layout per invoice:

```yaml
layout: "default"
layout_config:
  primary_color: "#0066cc"  # Client's brand color
  font_size_header: 28
```

This overrides the global settings in `config/invoice-template.yaml`.
