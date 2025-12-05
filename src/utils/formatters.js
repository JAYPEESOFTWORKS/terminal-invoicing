const { format, parseISO } = require('date-fns');

/**
 * Format a number as USD currency
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., "$1,234.56")
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

/**
 * Format a date object or ISO string to a readable format
 * @param {Date|string} date - Date to format
 * @param {string} formatStr - Format string (default: 'MMMM d, yyyy')
 * @returns {string} Formatted date string
 */
function formatDate(date, formatStr = 'MMMM d, yyyy') {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr);
}

/**
 * Format a date to ISO string
 * @param {Date} date - Date to format
 * @returns {string} ISO date string
 */
function toISOString(date) {
  return date.toISOString();
}

/**
 * Get the month name and year from a date
 * @param {Date|string} date - Date to format
 * @returns {string} Month and year (e.g., "December 2025")
 */
function getMonthYear(date) {
  return formatDate(date, 'MMMM yyyy');
}

/**
 * Parse a number safely
 * @param {any} value - Value to parse
 * @param {number} defaultValue - Default value if parsing fails
 * @returns {number} Parsed number
 */
function parseNumber(value, defaultValue = 0) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Round a number to 2 decimal places
 * @param {number} value - Value to round
 * @returns {number} Rounded value
 */
function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  formatCurrency,
  formatDate,
  toISOString,
  getMonthYear,
  parseNumber,
  roundCurrency
};
