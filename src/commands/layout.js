const layoutManager = require('../lib/layout-manager');

async function listLayouts() {
  console.log('\n🎨 Available Layouts\n');
  
  try {
    const layouts = layoutManager.listLayouts();
    
    layouts.forEach(layout => {
      console.log(`   ${layout.name.padEnd(15)} ${layout.description}`);
      console.log(`   ${''.padEnd(15)} v${layout.version} by ${layout.author}\n`);
    });
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function showLayout(layoutName) {
  console.log(`\n🎨 Layout: ${layoutName}\n`);
  
  try {
    const layout = layoutManager.getLayout(layoutName);
    
    console.log(`Name: ${layout.name}`);
    console.log(`Description: ${layout.description}`);
    console.log(`Version: ${layout.version || '1.0.0'}`);
    console.log(`Author: ${layout.author || 'Unknown'}\n`);
    
    if (layout.configSchema) {
      console.log('Configuration options:');
      console.log(JSON.stringify(layout.configSchema, null, 2));
      console.log('');
    }
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { listLayouts, showLayout };
