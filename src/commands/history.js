const yaml = require('js-yaml');
const invoiceProcessor = require('../lib/invoice-processor');
const { formatCurrency } = require('../utils/formatters');

async function listHistory(options) {
  console.log('\n📚 Invoice History\n');
  
  try {
    const filters = {
      month: options.month,
      customer: options.customer,
      limit: options.limit || 20
    };

    const archives = await invoiceProcessor.listArchives(filters);
    
    if (archives.length === 0) {
      console.log('No invoices found.\n');
      return;
    }

    console.log('Invoices:');
    archives.forEach(archive => {
      const date = archive.createdAt.toLocaleDateString();
      console.log(`   INV-${archive.invoiceNumber.toString().padEnd(6)} ${archive.yearMonth}  ${date}`);
    });
    console.log('');
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function showHistory(invoiceNumber) {
  console.log(`\n📄 Invoice ${invoiceNumber}\n`);
  
  try {
    const archivePath = await invoiceProcessor.findArchive(invoiceNumber);
    
    if (!archivePath) {
      console.error(`Invoice ${invoiceNumber} not found in archives.\n`);
      process.exit(1);
    }

    // Extract and display info (would need adm-zip)
    console.log(`Archive: ${archivePath}\n`);
    console.log('Use "Terminal Invoicing history export" to extract full contents.\n');
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function exportHistory(invoiceNumber, outputDir) {
  console.log(`\n📤 Exporting invoice ${invoiceNumber}...\n`);
  
  try {
    const result = await invoiceProcessor.extractArchive(invoiceNumber, outputDir);
    
    console.log(`✅ Extracted to: ${result.outputDir}`);
    console.log('Files:');
    result.files.forEach(file => console.log(`   ${file}`));
    console.log('');
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { listHistory, showHistory, exportHistory };
