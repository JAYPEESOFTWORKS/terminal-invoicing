const formData = require('form-data');
const Mailgun = require('mailgun.js');
const fs = require('fs');
const logger = require('../src/utils/logger');

/**
 * Mailgun Email Provider
 * Sends emails via Mailgun API
 */
const mailgunProvider = {
  name: 'mailgun',
  description: 'Send emails via Mailgun',
  
  /**
   * Send email via Mailgun
   * @param {object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.body - Email body (text)
   * @param {Array} options.attachments - Attachments [{path, filename}]
   * @param {object} config - Mailgun configuration
   * @returns {Promise<object>} Delivery info
   */
  async send(options, config) {
    try {
      // Validate config
      if (!config.api_key || !config.domain) {
        throw new Error('Mailgun configuration incomplete: missing api_key or domain');
      }

      // Initialize Mailgun
      const mailgun = new Mailgun(formData);
      const mg = mailgun.client({
        username: 'api',
        key: config.api_key
      });

      // Prepare message data
      const messageData = {
        from: options.from || config.from,
        to: options.to,
        subject: options.subject,
        text: options.body
      };

      // Add attachments if present
      if (options.attachments && options.attachments.length > 0) {
        messageData.attachment = options.attachments.map(att => ({
          filename: att.filename,
          data: fs.readFileSync(att.path)
        }));
      }

      // Send via Mailgun
      const response = await mg.messages.create(config.domain, messageData);

      logger.info(`Email sent via Mailgun: ${response.id}`);

      return {
        messageId: response.id,
        status: 'sent',
        timestamp: new Date().toISOString(),
        provider: 'mailgun',
        to: options.to,
        subject: options.subject
      };

    } catch (err) {
      logger.error(`Mailgun send failed: ${err.message}`);
      
      return {
        messageId: null,
        status: 'failed',
        timestamp: new Date().toISOString(),
        provider: 'mailgun',
        to: options.to,
        subject: options.subject,
        error: err.message
      };
    }
  },

  /**
   * Get delivery status (optional)
   * @param {string} messageId - Mailgun message ID
   * @param {object} config - Mailgun configuration
   * @returns {Promise<object>} Delivery status
   */
  async getDeliveryStatus(messageId, config) {
    try {
      const mailgun = new Mailgun(formData);
      const mg = mailgun.client({
        username: 'api',
        key: config.api_key
      });

      // Query events for this message
      const events = await mg.events.get(config.domain, {
        'message-id': messageId
      });

      if (events.items && events.items.length > 0) {
        const latestEvent = events.items[0];
        return {
          status: latestEvent.event, // 'accepted', 'delivered', 'failed', etc.
          timestamp: latestEvent.timestamp,
          details: latestEvent
        };
      }

      return {
        status: 'unknown',
        timestamp: new Date().toISOString()
      };

    } catch (err) {
      logger.error(`Failed to get Mailgun delivery status: ${err.message}`);
      return {
        status: 'unknown',
        error: err.message
      };
    }
  },

  /**
   * Test Mailgun configuration
   * @param {object} config - Mailgun configuration
   * @returns {Promise<boolean>} True if config is valid
   */
  async test(config) {
    try {
      const mailgun = new Mailgun(formData);
      const mg = mailgun.client({
        username: 'api',
        key: config.api_key
      });

      // Validate domain
      await mg.domains.get(config.domain);
      
      return true;
    } catch (err) {
      throw new Error(`Mailgun configuration test failed: ${err.message}`);
    }
  }
};

module.exports = mailgunProvider;
