const yaml = require('js-yaml');
const path = require('path');
const { 
  readFileSafe, 
  writeFileAtomic, 
  resolveProjectPath,
  fileExists 
} = require('../utils/file-utils');
const { 
  validate,
  companySchema,
  emailConfigSchema,
  invoiceTemplateSchema,
  emailTemplateSchema,
  stateSchema,
  customerSchema,
  itemSchema,
  invoiceSchema
} = require('../utils/validators');
const logger = require('../utils/logger');

/**
 * Configuration Manager
 * Handles loading and saving YAML configuration files
 */
class ConfigManager {
  constructor() {
    this.configDir = resolveProjectPath('config');
  }

  /**
   * Load company configuration
   * @returns {object} Company config
   */
  loadCompany() {
    const filePath = path.join(this.configDir, 'company.yaml');
    const content = readFileSafe(filePath);
    const data = yaml.load(content);
    return validate(data, companySchema, 'Company configuration');
  }

  /**
   * Save company configuration
   * @param {object} data - Company data
   */
  saveCompany(data) {
    const validated = validate(data, companySchema, 'Company configuration');
    const filePath = path.join(this.configDir, 'company.yaml');
    writeFileAtomic(filePath, yaml.dump(validated));
    logger.info('Saved company configuration');
  }

  /**
   * Load email configuration
   * @returns {object} Email config
   */
  loadEmail() {
    const filePath = path.join(this.configDir, 'email.yaml');
    const content = readFileSafe(filePath);
    const data = yaml.load(content);
    return validate(data, emailConfigSchema, 'Email configuration');
  }

  /**
   * Save email configuration
   * @param {object} data - Email data
   */
  saveEmail(data) {
    const validated = validate(data, emailConfigSchema, 'Email configuration');
    const filePath = path.join(this.configDir, 'email.yaml');
    writeFileAtomic(filePath, yaml.dump(validated));
    logger.info('Saved email configuration');
  }

  /**
   * Load invoice template configuration
   * @returns {object} Invoice template config
   */
  loadInvoiceTemplate() {
    const filePath = path.join(this.configDir, 'invoice-template.yaml');
    
    if (!fileExists(filePath)) {
      // Return defaults if file doesn't exist
      return validate({}, invoiceTemplateSchema, 'Invoice template');
    }
    
    const content = readFileSafe(filePath);
    const data = yaml.load(content);
    return validate(data, invoiceTemplateSchema, 'Invoice template');
  }

  /**
   * Save invoice template configuration
   * @param {object} data - Invoice template data
   */
  saveInvoiceTemplate(data) {
    const validated = validate(data, invoiceTemplateSchema, 'Invoice template');
    const filePath = path.join(this.configDir, 'invoice-template.yaml');
    writeFileAtomic(filePath, yaml.dump(validated));
    logger.info('Saved invoice template configuration');
  }

  /**
   * Load email template configuration
   * @returns {object} Email template config
   */
  loadEmailTemplate() {
    const filePath = path.join(this.configDir, 'email-template.yaml');
    const content = readFileSafe(filePath);
    const data = yaml.load(content);
    return validate(data, emailTemplateSchema, 'Email template');
  }

  /**
   * Save email template configuration
   * @param {object} data - Email template data
   */
  saveEmailTemplate(data) {
    const validated = validate(data, emailTemplateSchema, 'Email template');
    const filePath = path.join(this.configDir, 'email-template.yaml');
    writeFileAtomic(filePath, yaml.dump(validated));
    logger.info('Saved email template configuration');
  }

  /**
   * Load state (invoice counter, last run)
   * @returns {object} State
   */
  loadState() {
    const filePath = path.join(this.configDir, 'state.yaml');
    
    if (!fileExists(filePath)) {
      // Return default state if file doesn't exist
      return {
        next_invoice_number: 1,
        last_run: null
      };
    }
    
    const content = readFileSafe(filePath);
    const data = yaml.load(content);
    return validate(data, stateSchema, 'State');
  }

  /**
   * Save state atomically (critical for invoice number)
   * @param {object} data - State data
   */
  saveState(data) {
    const validated = validate(data, stateSchema, 'State');
    const filePath = path.join(this.configDir, 'state.yaml');
    writeFileAtomic(filePath, yaml.dump(validated));
    logger.info(`Saved state: next_invoice_number=${validated.next_invoice_number}`);
  }

  /**
   * Increment invoice number atomically
   * @returns {number} The invoice number that was assigned
   */
  incrementInvoiceNumber() {
    const state = this.loadState();
    const assignedNumber = state.next_invoice_number;
    state.next_invoice_number = assignedNumber + 1;
    this.saveState(state);
    return assignedNumber;
  }

  /**
   * Load a customer
   * @param {string} customerId - Customer ID
   * @returns {object} Customer data
   */
  loadCustomer(customerId) {
    const filePath = resolveProjectPath('customers', `${customerId}.yaml`);
    const content = readFileSafe(filePath);
    const data = yaml.load(content);
    return validate(data, customerSchema, `Customer ${customerId}`);
  }

  /**
   * Save a customer
   * @param {object} data - Customer data
   */
  saveCustomer(data) {
    const validated = validate(data, customerSchema, 'Customer');
    const filePath = resolveProjectPath('customers', `${validated.id}.yaml`);
    writeFileAtomic(filePath, yaml.dump(validated));
    logger.info(`Saved customer: ${validated.id}`);
  }

  /**
   * Load an item
   * @param {string} itemId - Item ID
   * @returns {object} Item data
   */
  loadItem(itemId) {
    const filePath = resolveProjectPath('items', `${itemId}.yaml`);
    const content = readFileSafe(filePath);
    const data = yaml.load(content);
    return validate(data, itemSchema, `Item ${itemId}`);
  }

  /**
   * Save an item
   * @param {object} data - Item data
   */
  saveItem(data) {
    const validated = validate(data, itemSchema, 'Item');
    const filePath = resolveProjectPath('items', `${validated.id}.yaml`);
    writeFileAtomic(filePath, yaml.dump(validated));
    logger.info(`Saved item: ${validated.id}`);
  }

  /**
   * Load an invoice definition
   * @param {string} invoiceId - Invoice ID
   * @returns {object} Invoice data
   */
  loadInvoice(invoiceId) {
    const filePath = resolveProjectPath('invoices', `${invoiceId}.yaml`);
    const content = readFileSafe(filePath);
    const data = yaml.load(content);
    return validate(data, invoiceSchema, `Invoice ${invoiceId}`);
  }

  /**
   * Save an invoice definition
   * @param {object} data - Invoice data
   */
  saveInvoice(data) {
    const validated = validate(data, invoiceSchema, 'Invoice');
    const filePath = resolveProjectPath('invoices', `${validated.id}.yaml`);
    writeFileAtomic(filePath, yaml.dump(validated));
    logger.info(`Saved invoice: ${validated.id}`);
  }

  /**
   * Check if project is initialized
   * @returns {boolean} True if initialized
   */
  isInitialized() {
    const requiredFiles = [
      path.join(this.configDir, 'company.yaml'),
      path.join(this.configDir, 'email.yaml')
    ];
    
    return requiredFiles.every(file => fileExists(file));
  }
}

module.exports = new ConfigManager();
