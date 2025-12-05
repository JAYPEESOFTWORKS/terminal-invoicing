const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const archiver = require('archiver');
const { addDays } = require('date-fns');
const configManager = require('./config-manager');
const pdfGenerator = require('./pdf-generator');
const emailManager = require('./email-manager');
const logger = require('../utils/logger');
const { 
  formatDate, 
  formatCurrency, 
  getMonthYear, 
  toISOString,
  roundCurrency 
} = require('../utils/formatters');
const { 
  resolveProjectPath, 
  ensureDir, 
  writeFileAtomic 
} = require('../utils/file-utils');

/**
 * Invoice Processor
 * Handles the complete invoice generation and delivery workflow
 */
class InvoiceProcessor {
  /**
   * Process an invoice: generate PDF, send email, create archive
   * @param {string} invoiceId - Invoice definition ID
   * @param {object} options - Processing options
   * @returns {Promise<object>} Processing result
   */
  async processInvoice(invoiceId, options = {}) {
    try {
      logger.info(`Processing invoice: ${invoiceId}`);

      // Step 1: Load invoice definition
      const invoiceDef = configManager.loadInvoice(invoiceId);
      
      // Step 2: Load customer data
      const customer = configManager.loadCustomer(invoiceDef.customer_id);
      
      // Step 3: Load all items
      const items = await this.loadItems(invoiceDef.items);
      
      // Step 4: Calculate totals
      const totals = this.calculateTotals(items);
      
      // Step 5: Get or assign invoice number
      const invoiceNumber = options.dryRun ? 
        'PREVIEW' : 
        configManager.incrementInvoiceNumber();
      
      // Step 6: Generate invoice dates
      const invoiceDate = options.invoiceDate || new Date();
      const dueDate = addDays(invoiceDate, customer.payment_terms_days || 30);
      
      // Step 7: Load configurations
      const company = configManager.loadCompany();
      const invoiceTemplate = configManager.loadInvoiceTemplate();
      
      // Step 8: Merge layout configuration
      const layoutConfig = {
        ...invoiceTemplate.layout_config,
        ...(invoiceDef.layout_config || {})
      };
      
      // Step 9: Build complete invoice data structure
      const invoiceData = {
        company: company,
        customer: {
          name: customer.name,
          info_lines: customer.info_lines,
          billing_email: customer.billing_email
        },
        invoice: {
          number: invoiceNumber.toString(),
          date: formatDate(invoiceDate),
          due_date: formatDate(dueDate),
          invoice_month: getMonthYear(invoiceDate)
        },
        items: items,
        totals: totals,
        layout: invoiceDef.layout || invoiceTemplate.layout,
        layoutConfig: layoutConfig,
        mailgun: invoiceDef.mailgun || {}
      };
      
      // Step 10: Generate PDF
      const pdfPath = options.output || 
        resolveProjectPath('invoices', `invoice-${invoiceNumber}.pdf`);
      
      await pdfGenerator.generate(invoiceData, pdfPath, {
        layout: invoiceData.layout,
        layoutConfig: layoutConfig
      });
      
      logger.info(`Generated PDF: ${pdfPath}`);

      // Step 11: Send email (unless disabled)
      let deliveryInfo = null;
      
      if (!options.noSend && !options.dryRun) {
        const emailConfig = configManager.loadEmail();
        const emailTemplate = configManager.loadEmailTemplate();
        
        deliveryInfo = await emailManager.sendInvoice(
          emailConfig,
          emailTemplate,
          invoiceData,
          pdfPath
        );
        
        logger.info(`Email sent: ${deliveryInfo.messageId}`);
      }
      
      // Step 12: Create archive (unless dry run)
      let archivePath = null;
      
      if (!options.dryRun) {
        archivePath = await this.createArchive(
          invoiceNumber,
          invoiceDate,
          invoiceData,
          invoiceDef,
          customer,
          items,
          pdfPath,
          deliveryInfo
        );
        
        logger.info(`Created archive: ${archivePath}`);
      }
      
      // Step 13: Update state
      if (!options.dryRun) {
        const state = configManager.loadState();
        state.last_run = toISOString(new Date());
        configManager.saveState(state);
      }

      return {
        success: true,
        invoiceNumber: invoiceNumber,
        pdfPath: pdfPath,
        archivePath: archivePath,
        deliveryInfo: deliveryInfo,
        total: totals.total
      };

    } catch (err) {
      logger.error(`Invoice processing failed: ${err.message}`, { error: err });
      throw err;
    }
  }

  /**
   * Load all items for an invoice
   * @param {string[]} itemIds - Array of item IDs
   * @returns {Promise<Array>} Array of item objects with amounts
   */
  async loadItems(itemIds) {
    const items = [];
    
    for (const itemId of itemIds) {
      const item = configManager.loadItem(itemId);
      
      // Calculate amount for non-comment items
      if (item.type !== 'comment') {
        item.amount = roundCurrency(item.quantity * item.rate);
      } else {
        item.amount = 0;
      }
      
      items.push(item);
    }
    
    return items;
  }

  /**
   * Calculate invoice totals
   * @param {Array} items - Array of items
   * @returns {object} Totals object
   */
  calculateTotals(items) {
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.amount || 0);
    }, 0);
    
    // Future: add tax support here
    const tax = 0;
    const total = roundCurrency(subtotal + tax);
    
    return {
      subtotal: subtotal,
      tax: tax,
      total: total
    };
  }

  /**
   * Create archive with invoice data and PDF
   * @param {number} invoiceNumber - Invoice number
   * @param {Date} invoiceDate - Invoice date
   * @param {object} invoiceData - Complete invoice data
   * @param {object} invoiceDef - Invoice definition
   * @param {object} customer - Customer data
   * @param {Array} items - Items
   * @param {string} pdfPath - Path to PDF
   * @param {object} deliveryInfo - Email delivery info
   * @returns {Promise<string>} Path to archive
   */
  async createArchive(invoiceNumber, invoiceDate, invoiceData, invoiceDef, customer, items, pdfPath, deliveryInfo) {
    return new Promise((resolve, reject) => {
      try {
        // Create archive directory structure: history/YYYY-MM/
        const yearMonth = formatDate(invoiceDate, 'yyyy-MM');
        const archiveDir = resolveProjectPath('history', yearMonth);
        ensureDir(archiveDir);
        
        const prefix = (deliveryInfo && deliveryInfo.status === 'failed') ? 'failure_' : '';
        const archivePath = path.join(archiveDir, `${prefix}INV-${invoiceNumber}.zip`);
        
        // Create write stream
        const output = fs.createWriteStream(archivePath);
        const archive = archiver('zip', {
          zlib: { level: 9 }
        });
        
        // Handle events
        output.on('close', () => {
          logger.debug(`Archive created: ${archivePath} (${archive.pointer()} bytes)`);
          resolve(archivePath);
        });
        
        archive.on('error', (err) => {
          reject(new Error(`Archive creation failed: ${err.message}`));
        });
        
        // Pipe archive to file
        archive.pipe(output);
        
        // Add PDF
        archive.file(pdfPath, { name: 'invoice.pdf' });
        
        // Add invoice parameters
        const invoiceParams = {
          invoice_definition: invoiceDef,
          customer: customer,
          items: items,
          invoice_data: {
            number: invoiceNumber,
            date: invoiceData.invoice.date,
            due_date: invoiceData.invoice.due_date,
            total: invoiceData.totals.total
          },
          generated_at: toISOString(new Date())
        };
        
        archive.append(yaml.dump(invoiceParams), { name: 'invoice-params.yaml' });
        
        // Add delivery info
        if (deliveryInfo) {
          archive.append(yaml.dump(deliveryInfo), { name: 'delivery.yaml' });
        } else {
          archive.append(yaml.dump({
            status: 'not_sent',
            reason: 'Email sending was disabled'
          }), { name: 'delivery.yaml' });
        }
        
        // Finalize archive
        archive.finalize();
        
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Extract archive contents
   * @param {number} invoiceNumber - Invoice number
   * @param {string} outputDir - Output directory
   * @returns {Promise<object>} Extracted files info
   */
  async extractArchive(invoiceNumber, outputDir) {
    const AdmZip = require('adm-zip');
    
    try {
      // Find archive
      const archivePath = await this.findArchive(invoiceNumber);
      
      if (!archivePath) {
        throw new Error(`Archive not found for invoice ${invoiceNumber}`);
      }
      
      // Extract
      ensureDir(outputDir);
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(outputDir, true);
      
      logger.info(`Extracted archive to: ${outputDir}`);
      
      return {
        outputDir: outputDir,
        files: ['invoice.pdf', 'invoice-params.yaml', 'delivery.yaml']
      };
      
    } catch (err) {
      logger.error(`Archive extraction failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Find archive for an invoice number
   * @param {number} invoiceNumber - Invoice number
   * @returns {Promise<string|null>} Archive path or null
   */
  async findArchive(invoiceNumber) {
    const historyDir = resolveProjectPath('history');
    
    if (!fs.existsSync(historyDir)) {
      return null;
    }
    
    // Search all year-month directories
    const yearMonths = fs.readdirSync(historyDir);
    
    for (const yearMonth of yearMonths) {
      const archivePath = path.join(historyDir, yearMonth, `INV-${invoiceNumber}.zip`);
      
      if (fs.existsSync(archivePath)) {
        return archivePath;
      }
    }
    
    return null;
  }

  /**
   * List archived invoices
   * @param {object} filters - Filter options
   * @returns {Promise<Array>} Array of invoice info
   */
  async listArchives(filters = {}) {
    const historyDir = resolveProjectPath('history');
    
    if (!fs.existsSync(historyDir)) {
      return [];
    }
    
    const archives = [];
    const yearMonths = fs.readdirSync(historyDir).sort().reverse();
    
    for (const yearMonth of yearMonths) {
      // Apply month filter
      if (filters.month && yearMonth !== filters.month) {
        continue;
      }
      
      const monthDir = path.join(historyDir, yearMonth);
      const files = fs.readdirSync(monthDir).filter(f => f.endsWith('.zip'));
      
      for (const file of files) {
        const match = file.match(/^INV-(\d+)\.zip$/);
        
        if (match) {
          const invoiceNumber = parseInt(match[1]);
          const archivePath = path.join(monthDir, file);
          const stats = fs.statSync(archivePath);
          
          archives.push({
            invoiceNumber: invoiceNumber,
            yearMonth: yearMonth,
            path: archivePath,
            size: stats.size,
            createdAt: stats.birthtime
          });
        }
      }
      
      // Apply limit
      if (filters.limit && archives.length >= filters.limit) {
        break;
      }
    }
    
    return archives.slice(0, filters.limit || archives.length);
  }
}

module.exports = new InvoiceProcessor();
