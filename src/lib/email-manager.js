const path = require('path');
const fs = require('fs');
const { resolveProjectPath, listFiles } = require('../utils/file-utils');
const logger = require('../utils/logger');

/**
 * Email Manager
 * Handles email provider plugins and template rendering
 */
class EmailManager {
  constructor() {
    this.providers = new Map();
    this.providersDir = path.join(__dirname, '..', '..', 'email-providers');
  }

  /**
   * Load all available email providers
   */
  loadProviders() {
    this.providers.clear();
    
    const providerFiles = listFiles(this.providersDir, '.js');
    
    providerFiles.forEach(filePath => {
      try {
        const provider = require(filePath);
        
        // Validate provider structure
        this.validateProvider(provider);
        
        this.providers.set(provider.name, {
          ...provider,
          path: filePath
        });
        
        logger.debug(`Loaded email provider: ${provider.name}`);
      } catch (err) {
        logger.error(`Failed to load email provider ${filePath}: ${err.message}`);
      }
    });
    
    if (this.providers.size === 0) {
      throw new Error('No email providers available');
    }
  }

  /**
   * Validate provider structure
   * @param {object} provider - Provider object
   * @throws {Error} If provider is invalid
   */
  validateProvider(provider) {
    if (!provider.name || typeof provider.name !== 'string') {
      throw new Error('Provider must have a name property');
    }
    
    if (!provider.send || typeof provider.send !== 'function') {
      throw new Error(`Provider ${provider.name} must have a send function`);
    }
  }

  /**
   * Get a provider by name
   * @param {string} name - Provider name
   * @returns {object} Provider object
   * @throws {Error} If provider not found
   */
  getProvider(name) {
    if (this.providers.size === 0) {
      this.loadProviders();
    }
    
    const provider = this.providers.get(name);
    
    if (!provider) {
      throw new Error(`Email provider not found: ${name}`);
    }
    
    return provider;
  }

  /**
   * Render email template with variables
   * @param {string} template - Template string with {{variables}}
   * @param {object} variables - Variable values
   * @returns {string} Rendered template
   */
  renderTemplate(template, variables) {
    let rendered = template;
    
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(regex, variables[key]);
    });
    
    return rendered;
  }

  /**
   * Send email using configured provider
   * @param {object} emailConfig - Email configuration
   * @param {object} emailTemplate - Email template
   * @param {object} invoiceData - Invoice data for template variables
   * @param {string} pdfPath - Path to PDF attachment
   * @returns {Promise<object>} Delivery info
   */
  async sendInvoice(emailConfig, emailTemplate, invoiceData, pdfPath) {
    try {
      // Get provider
      const provider = this.getProvider(emailConfig.provider);
      const providerConfig = emailConfig[emailConfig.provider];

      if (!providerConfig) {
        throw new Error(`Configuration missing for provider: ${emailConfig.provider}`);
      }

      // Prepare template variables
      const variables = {
        invoice_number: invoiceData.invoice.number,
        company_name: invoiceData.company.name,
        customer_name: invoiceData.customer.name,
        invoice_month: invoiceData.invoice.invoice_month,
        invoice_date: invoiceData.invoice.date,
        total_amount: invoiceData.totals.total.toFixed(2),
        due_date: invoiceData.invoice.due_date
      };

      // Render subject and body
      const subject = this.renderTemplate(emailTemplate.subject, variables);
      const body = this.renderTemplate(emailTemplate.body, variables);

      // Prepare email options
      const emailOptions = {
        to: invoiceData.customer.billing_email,
        subject: subject,
        body: body,
        from: invoiceData.mailgun?.from || providerConfig.from,
        attachments: [
          {
            path: pdfPath,
            filename: `invoice-${invoiceData.invoice.number}.pdf`
          }
        ]
      };

      // Send via provider
      const deliveryInfo = await provider.send(emailOptions, providerConfig);

      return deliveryInfo;

    } catch (err) {
      logger.error(`Failed to send invoice email: ${err.message}`);
      throw err;
    }
  }

  /**
   * Send test email
   * @param {object} emailConfig - Email configuration
   * @param {string} recipient - Test recipient
   * @returns {Promise<object>} Delivery info
   */
  async sendTest(emailConfig, recipient) {
    try {
      const provider = this.getProvider(emailConfig.provider);
      const providerConfig = emailConfig[emailConfig.provider];

      const emailOptions = {
        to: recipient,
        subject: 'Terminal Invoicing Test Email',
        body: 'This is a test email from Terminal Invoicing CLI.\n\nIf you received this, your email configuration is working correctly!',
        from: providerConfig.from
      };

      const deliveryInfo = await provider.send(emailOptions, providerConfig);
      
      return deliveryInfo;

    } catch (err) {
      logger.error(`Test email failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * List available providers
   * @returns {Array} Array of provider info
   */
  listProviders() {
    if (this.providers.size === 0) {
      this.loadProviders();
    }
    
    return Array.from(this.providers.values()).map(provider => ({
      name: provider.name,
      description: provider.description || 'No description'
    }));
  }

  /**
   * Test provider configuration
   * @param {object} emailConfig - Email configuration
   * @returns {Promise<boolean>} True if valid
   */
  async testConfiguration(emailConfig) {
    const provider = this.getProvider(emailConfig.provider);
    
    if (provider.test) {
      const providerConfig = emailConfig[emailConfig.provider];
      return await provider.test(providerConfig);
    }
    
    // If provider doesn't have test method, assume valid
    return true;
  }
}

module.exports = new EmailManager();
