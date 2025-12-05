const Joi = require('joi');

/**
 * Company configuration schema
 */
const companySchema = Joi.object({
  name: Joi.string().required(),
  info_lines: Joi.array().items(Joi.string()).min(1).required(),
  logo_path: Joi.string().allow(''),
  email: Joi.string().email().required()
});

/**
 * Customer schema
 */
const customerSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  info_lines: Joi.array().items(Joi.string()).min(1).required(),
  billing_email: Joi.string().email().required(),
  payment_terms_days: Joi.number().integer().min(1).default(30)
});

/**
 * Item schema
 */
const itemSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().valid('service', 'product', 'comment').required(),
  description: Joi.string().required(),
  detail: Joi.string().allow('').allow(null).optional(),
  quantity: Joi.when('type', {
    is: 'comment',
    then: Joi.forbidden(),
    otherwise: Joi.number().min(0).required()
  }),
  rate: Joi.when('type', {
    is: 'comment',
    then: Joi.forbidden(),
    otherwise: Joi.number().min(0).required()
  }),
  unit: Joi.when('type', {
    is: 'comment',
    then: Joi.forbidden(),
    otherwise: Joi.string().allow('').optional()
  })
});

/**
 * Invoice schema
 */
const invoiceSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  customer_id: Joi.string().required(),
  items: Joi.array().items(Joi.string()).min(1).required(),
  layout: Joi.string().default('default'),
  layout_config: Joi.object().optional(),
  schedule: Joi.object({
    day_of_month: Joi.number().integer().min(1).max(31).required(),
    enabled: Joi.boolean().default(true)
  }).required(),
  mailgun: Joi.object({
    from: Joi.string().email().optional(),
    subject_override: Joi.string().allow(null).optional(),
    body_override: Joi.string().allow(null).optional()
  }).optional()
});

/**
 * Email configuration schema
 */
const emailConfigSchema = Joi.object({
  provider: Joi.string().valid('mailgun').required(),
  mailgun: Joi.when('provider', {
    is: 'mailgun',
    then: Joi.object({
      api_key: Joi.string().required(),
      domain: Joi.string().required(),
      from: Joi.string().email().required()
    }).required()
  })
});

/**
 * Invoice template configuration schema
 */
const invoiceTemplateSchema = Joi.object({
  layout: Joi.string().default('default'),
  layout_config: Joi.object({
    primary_color: Joi.string().default('#000000'),
    text_color: Joi.string().default('#000000'),
    line_color: Joi.string().default('#000000'),
    font_family: Joi.string().default('Helvetica'),
    font_size_base: Joi.number().default(10),
    font_size_header: Joi.number().default(24),
    font_size_metadata: Joi.number().default(10),
    line_height: Joi.number().default(12),
    item_row_height: Joi.number().default(25),
    margins: Joi.object({
      top: Joi.number().default(72),
      bottom: Joi.number().default(72),
      left: Joi.number().default(72),
      right: Joi.number().default(72)
    }).default()
  }).default()
});

/**
 * Email template schema
 */
const emailTemplateSchema = Joi.object({
  subject: Joi.string().required(),
  body: Joi.string().required()
});

/**
 * State schema
 */
const stateSchema = Joi.object({
  next_invoice_number: Joi.number().integer().min(1).required(),
  last_run: Joi.string().isoDate().allow(null).optional()
});

/**
 * Validate data against a schema
 * @param {any} data - Data to validate
 * @param {Joi.Schema} schema - Joi schema
 * @param {string} name - Name for error messages
 * @returns {any} Validated data (with defaults applied)
 * @throws {Error} If validation fails
 */
function validate(data, schema, name = 'Data') {
  const { error, value } = schema.validate(data, { 
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    const details = error.details.map(d => d.message).join('; ');
    throw new Error(`${name} validation failed: ${details}`);
  }
  
  return value;
}

/**
 * Validation error class
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

module.exports = {
  companySchema,
  customerSchema,
  itemSchema,
  invoiceSchema,
  emailConfigSchema,
  invoiceTemplateSchema,
  emailTemplateSchema,
  stateSchema,
  validate,
  ValidationError
};
