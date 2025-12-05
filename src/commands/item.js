const inquirer = require('inquirer');
const yaml = require('js-yaml');
const { listFiles, resolveProjectPath, deleteFile } = require('../utils/file-utils');
const configManager = require('../lib/config-manager');
const path = require('path');
const fs = require('fs');

async function addItem() {
  console.log('\n📦 Add Item\n');
  
  const answers = await inquirer.prompt([
    { type: 'input', name: 'id', message: 'Item ID:', validate: i => i.trim().length > 0 },
    { type: 'list', name: 'type', message: 'Item type:', choices: ['service', 'product', 'comment'] },
    { type: 'input', name: 'description', message: 'Description:', validate: i => i.trim().length > 0 },
    { type: 'input', name: 'detail', message: 'Detail line (optional):', when: a => a.type !== 'comment' },
    { type: 'number', name: 'quantity', message: 'Quantity:', default: 1, when: a => a.type !== 'comment' },
    { type: 'number', name: 'rate', message: 'Rate:', when: a => a.type !== 'comment' },
    { type: 'input', name: 'unit', message: 'Unit (optional):', when: a => a.type !== 'comment' }
  ]);

  configManager.saveItem(answers);
  console.log(`\n✅ Item ${answers.id} added successfully\n`);
}

async function listItems() {
  const files = listFiles(resolveProjectPath('items'), '.yaml');
  
  if (files.length === 0) {
    console.log('\nNo items found.\n');
    return;
  }

  console.log('\nItems:\n');
  files.forEach(file => {
    try {
      const id = path.basename(file, '.yaml');
      const item = configManager.loadItem(id);
      console.log(`  ${item.id.padEnd(25)} [${item.type.padEnd(8)}] ${item.description}`);
    } catch (err) {
      console.log(`  ${path.basename(file).padEnd(25)} (invalid)`);
    }
  });
  console.log('');
}

async function showItem(itemId) {
  try {
    const item = configManager.loadItem(itemId);
    console.log('\nItem Details:\n');
    console.log(yaml.dump(item));
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function editItem(itemId) {
  const { spawnSync } = require('child_process');
  const editor = process.env.EDITOR || 'vi';
  const filePath = resolveProjectPath('items', `${itemId}.yaml`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ Item not found: ${itemId}\n`);
    process.exit(1);
  }

  spawnSync(editor, [filePath], { stdio: 'inherit' });
  console.log('\n✅ Item updated\n');
}

async function removeItem(itemId) {
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: `Delete item ${itemId}?`, default: false }
  ]);
  
  if (!confirm) {
    console.log('\nCancelled\n');
    return;
  }

  const filePath = resolveProjectPath('items', `${itemId}.yaml`);
  if (deleteFile(filePath)) {
    console.log(`\n✅ Item ${itemId} deleted\n`);
  } else {
    console.error(`\n❌ Item not found: ${itemId}\n`);
    process.exit(1);
  }
}

module.exports = { addItem, listItems, showItem, editItem, removeItem };
