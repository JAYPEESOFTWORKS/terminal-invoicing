const crontab = require('crontab');
const path = require('path');
const os = require('os');
const { listFiles, resolveProjectPath, ensureDir } = require('../utils/file-utils');
const configManager = require('./config-manager');
const logger = require('../utils/logger');

/**
 * Cron Manager
 * Handles crontab manipulation for automated invoice generation
 */
class CronManager {
  constructor() {
    this.marker = 'Terminal Invoicing';
  }

  /**
   * Get the path to the Terminal Invoicing binary
   * @returns {string} Binary path
   *
   * Cron's environment is very sparse – there may be no PATH at all – so when
   * this method is called from a job the `which` lookup will typically fail
   * and we fall back to the copy of the script that lives in the project
   * directory.  That fallback path is relative to the project root, however, so
   * a cron job must either `cd` into that directory later (see setup()) or
   * supply a fully‑qualified path itself.
   */
  getBinaryPath() {
    // Try to find the installed binary
    const { execSync } = require('child_process');
    
    try {
      const which = execSync('which Terminal Invoicing', { encoding: 'utf8' }).trim();
      if (which) return which;
    } catch (err) {
      // Not in PATH
      logger.debug('getBinaryPath: `which` failed, falling back to project bin');
    }
    
    // Fallback to local bin
    return path.join(resolveProjectPath(), 'bin', 'terminv.js');
  }

  /**
   * Get log file path
   * @returns {string} Log path
   */
  getLogPath() {
    const logDir = path.join(os.homedir(), './terminal_invoicing', 'logs');
    ensureDir(logDir);
    return path.join(logDir, 'cron.log');
  }

  /**
   * Setup cron jobs for all enabled invoices
   * @returns {Promise<object>} Result with added/removed counts
   */
  async setup() {
    return new Promise((resolve, reject) => {
      crontab.load((err, tab) => {
        if (err) {
          return reject(new Error(`Failed to load crontab: ${err.message}`));
        }

        try {
          // Get all invoice files
          const invoiceFiles = listFiles(resolveProjectPath('invoices'), '.yaml');
          const enabledInvoices = [];

          // Load and filter enabled invoices
          invoiceFiles.forEach(filePath => {
            try {
              const invoiceId = path.basename(filePath, '.yaml');
              const invoice = configManager.loadInvoice(invoiceId);
              
              if (invoice.schedule && invoice.schedule.enabled) {
                enabledInvoices.push({
                  id: invoiceId,
                  name: invoice.name,
                  day: invoice.schedule.day_of_month
                });
              }
            } catch (err) {
              logger.warn(`Skipping invalid invoice ${filePath}: ${err.message}`);
            }
          });

          // Remove existing Terminal Invoicing cron jobs
          const existingJobs = tab.jobs({ comment: new RegExp(this.marker) });
          const removedCount = existingJobs.length;
          existingJobs.forEach(job => tab.remove(job));

          // Add new jobs
          const binPath = this.getBinaryPath();
          const logPath = this.getLogPath();
          let addedCount = 0;

          enabledInvoices.forEach(invoice => {
            // build a fully‑qualified command string that works when cron runs with
          // a bare environment and unpredictable working directory.  cron jobs
          // are executed from the user's home (or "/" on some systems), so any
          // relative paths or reliance on `process.cwd()` inside the script will
          // fail.  we `cd` into the project root and explicitly invoke node using
          // `process.execPath` rather than relying on a shebang/`env` call.
          const projectDir = resolveProjectPath();
          const nodeExec = process.execPath; // absolute path to the running node binary

          // make sure the binary path is absolute (getBinaryPath might return a
          // local relative path when `which` fails in cron).  resolve it against the
          // project directory so it still works when cron starts in / or ~.
          const resolvedBin = path.isAbsolute(binPath)
            ? binPath
            : path.join(projectDir, binPath);

          const command = `cd ${projectDir} && ${nodeExec} ${resolvedBin} invoice generate ${invoice.id} --quiet >> ${logPath} 2>&1`;
          const schedule = `0 9 ${invoice.day} * *`; // 9:00 AM on specified day
          const comment = `${this.marker}: ${invoice.name}`;

          tab.create(command, schedule, comment);
          addedCount++;

          logger.info(`Added cron job: ${invoice.name} (day ${invoice.day})`);
          });

          // Save crontab
          tab.save((err) => {
            if (err) {
              return reject(new Error(`Failed to save crontab: ${err.message}`));
            }

            logger.info(`Cron setup complete: ${addedCount} added, ${removedCount} removed`);
            
            resolve({
              added: addedCount,
              removed: removedCount,
              invoices: enabledInvoices
            });
          });

        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Remove all Terminal Invoicing cron jobs
   * @returns {Promise<number>} Number of jobs removed
   */
  async remove() {
    return new Promise((resolve, reject) => {
      crontab.load((err, tab) => {
        if (err) {
          return reject(new Error(`Failed to load crontab: ${err.message}`));
        }

        try {
          const jobs = tab.jobs({ comment: new RegExp(this.marker) });
          const count = jobs.length;

          jobs.forEach(job => {
            tab.remove(job);
            logger.debug(`Removed cron job: ${job.command()}`);
          });

          tab.save((err) => {
            if (err) {
              return reject(new Error(`Failed to save crontab: ${err.message}`));
            }

            logger.info(`Removed ${count} cron jobs`);
            resolve(count);
          });

        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * List current Terminal Invoicing cron jobs
   * @returns {Promise<Array>} Array of job info
   */
  async list() {
    return new Promise((resolve, reject) => {
      crontab.load((err, tab) => {
        if (err) {
          return reject(new Error(`Failed to load crontab: ${err.message}`));
        }

        try {
          const jobs = tab.jobs({ comment: new RegExp(this.marker) });
          
          const jobInfo = jobs.map(job => ({
            schedule: job.toString().split(' ').slice(0, 5).join(' '),
            command: job.command(),
            comment: job.comment()
          }));

          resolve(jobInfo);

        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Get what would be scheduled
   * @returns {Promise<Array>} Array of invoice schedule info
   */
  async preview() {
    const invoiceFiles = listFiles(resolveProjectPath('invoices'), '.yaml');
    const schedules = [];

    invoiceFiles.forEach(filePath => {
      try {
        const invoiceId = path.basename(filePath, '.yaml');
        const invoice = configManager.loadInvoice(invoiceId);

        if (invoice.schedule) {
          schedules.push({
            id: invoiceId,
            name: invoice.name,
            enabled: invoice.schedule.enabled,
            day: invoice.schedule.day_of_month,
            schedule: `0 9 ${invoice.schedule.day_of_month} * *`,
            description: `9:00 AM on day ${invoice.schedule.day_of_month} of each month`
          });
        }
      } catch (err) {
        logger.warn(`Skipping invalid invoice ${filePath}: ${err.message}`);
      }
    });

    return schedules;
  }

  /**
   * Check if cron is available on the system
   * @returns {boolean} True if cron is available
   */
  isCronAvailable() {
    const { execSync } = require('child_process');
    
    try {
      execSync('which crontab', { encoding: 'utf8' });
      return true;
    } catch (err) {
      return false;
    }
  }
}

module.exports = new CronManager();
