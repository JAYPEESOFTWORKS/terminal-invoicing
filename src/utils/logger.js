const winston = require('winston');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Ensure log directory exists
const logDir = path.join(os.homedir(), '.Terminal Invoicing', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Create a Winston logger instance with file and console transports
 * @returns {winston.Logger} Configured logger
 */
function createLogger() {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    ),
    defaultMeta: { service: 'Terminal Invoicing' },
    transports: [
      // Write all logs to combined.log
      new winston.transports.File({ 
        filename: path.join(logDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      // Write errors to error.log
      new winston.transports.File({ 
        filename: path.join(logDir, 'error.log'), 
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5
      })
    ]
  });

  // Also log to console in development
  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  return logger;
}

module.exports = createLogger();
