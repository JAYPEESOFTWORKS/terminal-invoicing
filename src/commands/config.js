const yaml = require('js-yaml');
const configManager = require('../lib/config-manager');
const { spawnSync } = require('child_process');
const { resolveProjectPath } = require('../utils/file-utils');
const path = require('path');

async function showConfig() {
  try {
    const company = configManager.loadCompany();
    const email = configManager.loadEmail();
    const invoiceTemplate = configManager.loadInvoiceTemplate();
    const state = configManager.loadState();

    console.log('\n⚙️  Configuration\n');
    console.log('Company:');
    console.log(yaml.dump(company).split('\n').map(l => '  ' + l).join('\n'));
    console.log('\nEmail:');
    const emailSafe = { ...email };
    if (emailSafe.mailgun) emailSafe.mailgun.api_key = '***';
    console.log(yaml.dump(emailSafe).split('\n').map(l => '  ' + l).join('\n'));
    console.log('\nState:');
    console.log(yaml.dump(state).split('\n').map(l => '  ' + l).join('\n'));
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function setConfig(key, value) {
  console.log(`\n⚙️  Setting ${key} = ${value}\n`);
  console.log('❌ Not implemented yet. Use "Terminal Invoicing config edit" instead.\n');
  process.exit(1);
}

async function editConfig() {
  const editor = process.env.EDITOR || 'vi';
  const configDir = resolveProjectPath('config');

  console.log('\n⚙️  Opening config directory in editor...\n');
  console.log(`Files: company.yaml, email.yaml, invoice-template.yaml, email-template.yaml\n`);

  spawnSync(editor, [configDir], { stdio: 'inherit' });
  console.log('\n✅ Config updated\n');
}

module.exports = { showConfig, setConfig, editConfig };
