const configManager = require('../lib/config-manager');
const emailManager = require('../lib/email-manager');

async function testEmail(recipient) {
  console.log('\n📧 Testing email configuration...\n');
  
  try {
    const emailConfig = configManager.loadEmail();
    const company = configManager.loadCompany();
    
    const testRecipient = recipient || company.email;
    console.log(`Sending test email to: ${testRecipient}\n`);

    const result = await emailManager.sendTest(emailConfig, testRecipient);
    
    if (result.status === 'sent') {
      console.log('✅ Test email sent successfully');
      console.log(`   Message ID: ${result.messageId}\n`);
    } else {
      console.log(`❌ Test email failed: ${result.error || 'Unknown error'}\n`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function listProviders() {
  console.log('\n📧 Available Email Providers\n');
  
  try {
    const providers = emailManager.listProviders();
    
    providers.forEach(provider => {
      console.log(`   ${provider.name.padEnd(15)} ${provider.description}`);
    });
    console.log('');
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  }
}

async function configureEmail() {
  console.log('\n📧 Email configuration\n');
  console.log('Use "Terminal Invoicing config edit" to modify email settings.\n');
}

module.exports = { testEmail, listProviders, configureEmail };
