const cronManager = require('../lib/cron-manager');

async function setupSchedule() {
  console.log('\n⏰ Setting up cron jobs...\n');
  
  if (!cronManager.isCronAvailable()) {
    console.error('❌ crontab not found. Cron scheduling is not available on this system.\n');
    process.exit(1);
  }

  try {
    const result = await cronManager.setup();
    
    console.log(`✅ Cron jobs configured:`);
    console.log(`   Added: ${result.added}`);
    console.log(`   Removed: ${result.removed}\n`);
    
    if (result.invoices.length > 0) {
      console.log('Scheduled invoices:');
      result.invoices.forEach(inv => {
        console.log(`   ${inv.name} - Day ${inv.day} at 9:00 AM`);
      });
      console.log('');
    }
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function removeSchedule() {
  console.log('\n⏰ Removing cron jobs...\n');
  
  try {
    const count = await cronManager.remove();
    console.log(`✅ Removed ${count} cron jobs\n`);
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function listSchedule() {
  console.log('\n⏰ Current Schedule\n');
  
  try {
    const jobs = await cronManager.list();
    
    if (jobs.length === 0) {
      console.log('No cron jobs configured.\n');
    } else {
      console.log('Active cron jobs:');
      jobs.forEach(job => {
        console.log(`   ${job.schedule} - ${job.comment}`);
      });
      console.log('');
    }

    // Show preview
    console.log('Would be scheduled:');
    const preview = await cronManager.preview();
    preview.forEach(inv => {
      const status = inv.enabled ? '✓' : '✗';
      console.log(`   [${status}] ${inv.name} - ${inv.description}`);
    });
    console.log('');
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { setupSchedule, removeSchedule, listSchedule };
