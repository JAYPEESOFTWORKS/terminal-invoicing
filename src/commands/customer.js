const inquirer = require('inquirer');
const yaml = require('js-yaml');
const { listFiles, resolveProjectPath, deleteFile } = require('../utils/file-utils');
const configManager = require('../lib/config-manager');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

async function addCustomer() {
  console.log('\n📋 Add Customer\n');
  
  const answers = await inquirer.prompt([
    { type: 'input', name: 'id', message: 'Customer ID:', validate: i => i.trim().length > 0 },
    { type: 'input', name: 'name', message: 'Customer name:', validate: i => i.trim().length > 0 },
    { type: 'input', name: 'billing_email', message: 'Billing email:', validate: i => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i) },
    { type: 'number', name: 'payment_terms_days', message: 'Payment terms (days):', default: 30 }
  ]);

  console.log('\nEnter customer address/contact info (one line at a time, empty line to finish):');
  const infoLines = [];
  let lineNum = 1;
  
  while (true) {
    const { line } = await inquirer.prompt([{ type: 'input', name: 'line', message: `Line ${lineNum}:` }]);
    if (line.trim() === '') break;
    infoLines.push(line.trim());
    lineNum++;
  }

  const customer = { ...answers, info_lines: infoLines };
  configManager.saveCustomer(customer);
  
  console.log(`\n✅ Customer ${answers.id} added successfully\n`);
}

async function listCustomers() {
  const files = listFiles(resolveProjectPath('customers'), '.yaml');
  
  if (files.length === 0) {
    console.log('\nNo customers found.\n');
    return;
  }

  console.log('\nCustomers:\n');
  files.forEach(file => {
    try {
      const id = path.basename(file, '.yaml');
      const customer = configManager.loadCustomer(id);
      console.log(`  ${customer.id.padEnd(20)} ${customer.name}`);
    } catch (err) {
      console.log(`  ${path.basename(file).padEnd(20)} (invalid)`);
    }
  });
  console.log('');
}

async function showCustomer(customerId) {
  try {
    const customer = configManager.loadCustomer(customerId);
    console.log('\nCustomer Details:\n');
    console.log(yaml.dump(customer));
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function editCustomer(customerId) {
  const { spawnSync } = require('child_process');
  const editor = process.env.EDITOR || 'vi';
  const filePath = resolveProjectPath('customers', `${customerId}.yaml`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ Customer not found: ${customerId}\n`);
    process.exit(1);
  }

  spawnSync(editor, [filePath], { stdio: 'inherit' });
  console.log('\n✅ Customer updated\n');
}

async function removeCustomer(customerId) {
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: `Delete customer ${customerId}?`, default: false }
  ]);
  
  if (!confirm) {
    console.log('\nCancelled\n');
    return;
  }

  const filePath = resolveProjectPath('customers', `${customerId}.yaml`);
  if (deleteFile(filePath)) {
    console.log(`\n✅ Customer ${customerId} deleted\n`);
  } else {
    console.error(`\n❌ Customer not found: ${customerId}\n`);
    process.exit(1);
  }
}

module.exports = { addCustomer, listCustomers, showCustomer, editCustomer, removeCustomer };
