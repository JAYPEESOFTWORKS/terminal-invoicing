# Custom Layouts Guide

Layouts define how invoices are rendered to PDF. Terminal Invoicing ships with a default layout, but you can create custom layouts to match your brand or specific needs.

## Layout Structure

A layout is a JavaScript module that exports an object with the following structure:

```javascript
const layout = {
  name: 'my-layout',              // Unique identifier
  description: 'My custom layout', // Human-readable description
  author: 'Your Name',            // Author name
  version: '1.0.0',               // Semantic version
  
  // Optional: Define supported configuration options
  configSchema: {
    primary_color: '#000000',
    font_family: 'Helvetica'
  },
  
  // Main rendering function
  render(doc, data, config) {
    // Render PDF using PDFKit
  }
};

module.exports = layout;
```

## The Render Function

### Parameters

- **doc**: PDFKit document instance
- **data**: Invoice data object (see below)
- **config**: Layout configuration (from invoice-template.yaml + invoice overrides)

### Invoice Data Structure

```javascript
{
  company: {
    name: string,
    info_lines: string[],
    logo_path: string,
    email: string
  },
  customer: {
    name: string,
    info_lines: string[],
    billing_email: string
  },
  invoice: {
    number: string,           // Invoice number
    date: string,             // Formatted date
    due_date: string,         // Formatted due date
    invoice_month: string     // e.g., "December 2025"
  },
  items: [
    {
      id: string,
      type: 'service' | 'product' | 'comment',
      description: string,
      detail: string | null,
      quantity: number,
      rate: number,
      amount: number
    }
  ],
  totals: {
    subtotal: number,
    tax: number,
    total: number
  }
}
```

## Creating a Custom Layout

### 1. Create Layout File

Create a new file in the `layouts/` directory:

```bash
touch layouts/modern.js
```

### 2. Implement Layout

```javascript
const PDFDocument = require('pdfkit');
const { formatCurrency } = require('../src/utils/formatters');

const layout = {
  name: 'modern',
  description: 'Modern invoice layout with bold colors',
  author: 'Your Name',
  version: '1.0.0',
  
  render(doc, data, config) {
    const margins = config.margins || { top: 72, bottom: 72, left: 72, right: 72 };
    
    // Your rendering code here
    doc.fontSize(32)
       .fillColor(config.primary_color || '#000000')
       .text('INVOICE', margins.left, margins.top);
    
    // ... render rest of invoice
  }
};

module.exports = layout;
```

### 3. Use Custom Layout

Reference your layout in invoice definitions:

```yaml
# invoices/my-invoice.yaml
layout: "modern"
layout_config:
  primary_color: "#0066cc"
```

## Best Practices

### Page Breaks

Handle page breaks gracefully:

```javascript
let currentY = margins.top;

items.forEach(item => {
  const itemHeight = 40;
  
  // Check if item fits on current page
  if (currentY + itemHeight > doc.page.height - margins.bottom) {
    doc.addPage();
    currentY = margins.top;
    // Redraw headers on new page
  }
  
  // Draw item
  currentY += itemHeight;
});
```

### Logo Handling

Always handle missing logos:

```javascript
if (data.company.logo_path && fs.existsSync(data.company.logo_path)) {
  try {
    doc.image(data.company.logo_path, x, y, { width: 150 });
  } catch (err) {
    // Continue without logo
  }
}
```

### Comment Items

Handle comment-type items differently:

```javascript
items.forEach(item => {
  if (item.type === 'comment') {
    // Render as italic text, full width
    doc.font('Helvetica-Oblique')
       .text(item.description);
  } else {
    // Render as table row with quantity, rate, amount
  }
});
```

### Currency Formatting

Use the formatters utility:

```javascript
const { formatCurrency } = require('../src/utils/formatters');

doc.text(formatCurrency(item.amount)); // $1,234.56
```

## Testing Your Layout

Generate a preview:

```bash
Terminal Invoicing invoice generate my-invoice --preview
```

## Example: Minimal Layout

See `default.js` for a complete working example. Here's a minimal layout:

```javascript
const layout = {
  name: 'minimal',
  description: 'Minimal invoice layout',
  author: 'Terminal Invoicing',
  version: '1.0.0',
  
  render(doc, data, config) {
    let y = 72;
    
    // Company name
    doc.fontSize(12).text(data.company.name, 72, y);
    y += 40;
    
    // Invoice number
    doc.text(`Invoice #${data.invoice.number}`, 72, y);
    y += 20;
    
    // Customer
    doc.text(`Bill To: ${data.customer.name}`, 72, y);
    y += 40;
    
    // Items
    data.items.forEach(item => {
      if (item.type !== 'comment') {
        doc.text(`${item.description}: ${formatCurrency(item.amount)}`, 72, y);
        y += 20;
      }
    });
    
    // Total
    y += 20;
    doc.fontSize(14).text(`Total: ${formatCurrency(data.totals.total)}`, 72, y);
  }
};

module.exports = layout;
```

## Troubleshooting

**Layout not found**: Ensure the file is in `layouts/` directory and exports the correct structure.

**PDF rendering issues**: Check logs at `~/.terminal_invoicing/logs/error.log` for detailed error messages.

**Missing fonts**: PDFKit includes Helvetica by default. For custom fonts, use:

```javascript
doc.registerFont('CustomFont', 'path/to/font.ttf');
doc.font('CustomFont');
```
