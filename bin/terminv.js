#!/usr/bin/env node

const { program } = require('commander');
const configManager = require('../src/lib/config-manager');

// Import commands
const initCommand = require('../src/commands/init');
const { showConfig, setConfig, editConfig } = require('../src/commands/config');
const { addCustomer, listCustomers, showCustomer, editCustomer, removeCustomer } = require('../src/commands/customer');
const { addItem, listItems, showItem, editItem, removeItem } = require('../src/commands/item');
const { createInvoice, listInvoices, showInvoice, editInvoice, removeInvoice, generateInvoice } = require('../src/commands/invoice');
const { setupSchedule, removeSchedule, listSchedule } = require('../src/commands/schedule');
const { listHistory, showHistory, exportHistory } = require('../src/commands/history');
const { testEmail, listProviders, configureEmail } = require('../src/commands/email');
const { listLayouts, showLayout } = require('../src/commands/layout');

program
  .name('Terminal Invoicing')
  .description('Professional command-line invoicing system')
  .version('1.0.0');

// Init command
program
  .command('init')
  .description('Initialize Terminal Invoicing configuration')
  .action(initCommand);

// Config commands
const config = program.command('config').description('Manage configuration');

config
  .command('show')
  .description('Show current configuration')
  .action(showConfig);

config
  .command('set <key> <value>')
  .description('Set configuration value')
  .action(setConfig);

config
  .command('edit')
  .description('Edit configuration files')
  .action(editConfig);

// Customer commands
const customer = program.command('customer').description('Manage customers');

customer
  .command('add')
  .description('Add a new customer')
  .action(addCustomer);

customer
  .command('list')
  .description('List all customers')
  .action(listCustomers);

customer
  .command('show <customer-id>')
  .description('Show customer details')
  .action(showCustomer);

customer
  .command('edit <customer-id>')
  .description('Edit customer')
  .action(editCustomer);

customer
  .command('remove <customer-id>')
  .description('Remove customer')
  .action(removeCustomer);

// Item commands
const item = program.command('item').description('Manage items');

item
  .command('add')
  .description('Add a new item')
  .action(addItem);

item
  .command('list')
  .description('List all items')
  .action(listItems);

item
  .command('show <item-id>')
  .description('Show item details')
  .action(showItem);

item
  .command('edit <item-id>')
  .description('Edit item')
  .action(editItem);

item
  .command('remove <item-id>')
  .description('Remove item')
  .action(removeItem);

// Invoice commands
const invoice = program.command('invoice').description('Manage invoices');

invoice
  .command('create')
  .description('Create a new recurring invoice')
  .action(createInvoice);

invoice
  .command('list')
  .description('List all invoices')
  .action(listInvoices);

invoice
  .command('show <invoice-id>')
  .description('Show invoice details')
  .action(showInvoice);

invoice
  .command('edit <invoice-id>')
  .description('Edit invoice')
  .action(editInvoice);

invoice
  .command('remove <invoice-id>')
  .description('Remove invoice')
  .action(removeInvoice);

invoice
  .command('generate <invoice-id>')
  .description('Generate and send invoice')
  .option('--dry-run', 'Generate PDF but don\'t send or increment counter')
  .option('--no-send', 'Generate PDF and archive but don\'t email')
  .option('--preview', 'Generate and open PDF in viewer')
  .option('--output <path>', 'Save PDF to specific location')
  .option('--quiet', 'Suppress output (for cron)')
  .action(generateInvoice);

// Schedule commands
const schedule = program.command('schedule').description('Manage cron schedules');

schedule
  .command('setup')
  .description('Setup cron jobs for enabled invoices')
  .action(setupSchedule);

schedule
  .command('remove')
  .description('Remove all Terminal Invoicing cron jobs')
  .action(removeSchedule);

schedule
  .command('list')
  .description('List current schedule')
  .action(listSchedule);

// History commands
const history = program.command('history').description('View invoice history');

history
  .command('list')
  .description('List archived invoices')
  .option('--month <YYYY-MM>', 'Filter by month')
  .option('--customer <customer-id>', 'Filter by customer')
  .option('--limit <n>', 'Limit results')
  .action(listHistory);

history
  .command('show <invoice-number>')
  .description('Show invoice archive details')
  .action(showHistory);

history
  .command('export <invoice-number> <output-dir>')
  .description('Extract archive contents')
  .action(exportHistory);

// Email commands
const email = program.command('email').description('Manage email settings');

email
  .command('test [recipient]')
  .description('Send test email')
  .action(testEmail);

email
  .command('providers')
  .description('List available email providers')
  .action(listProviders);

email
  .command('configure')
  .description('Configure email provider')
  .action(configureEmail);

// Layout commands
const layout = program.command('layout').description('Manage layouts');

layout
  .command('list')
  .description('List available layouts')
  .action(listLayouts);

layout
  .command('show <layout-name>')
  .description('Show layout details')
  .action(showLayout);

// Check if initialized (except for init command)
program.hook('preAction', (thisCommand, actionCommand) => {
  const command = actionCommand.name();
  
  if (command !== 'init' && !configManager.isInitialized()) {
    console.error('\n❌ Terminal Invoicing not initialized. Run "terminv init" first.\n');
    process.exit(1);
  }
});

program.parse();
