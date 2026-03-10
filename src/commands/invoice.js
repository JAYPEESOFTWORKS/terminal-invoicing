const inquirer = require("inquirer");
const yaml = require("js-yaml");
const {
    listFiles,
    resolveProjectPath,
    deleteFile,
} = require("../utils/file-utils");
const configManager = require("../lib/config-manager");
const invoiceProcessor = require("../lib/invoice-processor");
const pdfGenerator = require("../lib/pdf-generator");
const path = require("path");
const fs = require("fs");

async function createInvoice() {
    console.log("\n📄 Create Invoice\n");

    // Get customers
    const customerFiles = listFiles(resolveProjectPath("customers"), ".yaml");
    if (customerFiles.length === 0) {
        console.error("❌ No customers found. Add customers first.\n");
        process.exit(1);
    }
    const customerChoices = customerFiles.map((f) => {
        const id = path.basename(f, ".yaml");
        const c = configManager.loadCustomer(id);
        return { name: `${c.id} - ${c.name}`, value: c.id };
    });

    // Get items
    const itemFiles = listFiles(resolveProjectPath("items"), ".yaml");
    if (itemFiles.length === 0) {
        console.error("❌ No items found. Add items first.\n");
        process.exit(1);
    }
    const itemChoices = itemFiles.map((f) => {
        const id = path.basename(f, ".yaml");
        const i = configManager.loadItem(id);
        return { name: `${i.id} - ${i.description}`, value: i.id };
    });

    const answers = await inquirer.prompt([
        {
            type: "input",
            name: "id",
            message: "Invoice ID:",
            validate: (i) => i.trim().length > 0,
        },
        {
            type: "input",
            name: "name",
            message: "Invoice name:",
            validate: (i) => i.trim().length > 0,
        },
        {
            type: "list",
            name: "customer_id",
            message: "Customer:",
            choices: customerChoices,
        },
        {
            type: "checkbox",
            name: "items",
            message: "Items:",
            choices: itemChoices,
            validate: (i) => i.length > 0,
        },
        {
            type: "number",
            name: "day_of_month",
            message: "Day of month to send:",
            default: 1,
            validate: (i) => i >= 1 && i <= 31,
        },
        {
            type: "confirm",
            name: "enabled",
            message: "Enable scheduling?",
            default: true,
        },
    ]);

    const invoice = {
        id: answers.id,
        name: answers.name,
        customer_id: answers.customer_id,
        items: answers.items,
        layout: "default",
        schedule: {
            day_of_month: answers.day_of_month,
            enabled: answers.enabled,
        },
    };

    configManager.saveInvoice(invoice);
    console.log(`\n✅ Invoice ${answers.id} created successfully\n`);
}

async function listInvoices() {
    const files = listFiles(resolveProjectPath("invoices"), ".yaml");

    if (files.length === 0) {
        console.log("\nNo invoices found.\n");
        return;
    }

    console.log("\nInvoices:\n");
    files.forEach((file) => {
        try {
            const id = path.basename(file, ".yaml");
            const invoice = configManager.loadInvoice(id);
            const status = invoice.schedule?.enabled
                ? "✓ enabled "
                : "✗ disabled";
            console.log(
                `  ${invoice.id.padEnd(25)} [${status}] ${invoice.name}`
            );
        } catch (err) {
            console.log(`  ${path.basename(file).padEnd(25)} (invalid)`);
        }
    });
    console.log("");
}

async function showInvoice(invoiceId) {
    try {
        const invoice = configManager.loadInvoice(invoiceId);
        console.log("\nInvoice Details:\n");
        console.log(yaml.dump(invoice));
    } catch (err) {
        console.error(`\n❌ ${err.message}\n`);
        process.exit(1);
    }
}

async function editInvoice(invoiceId) {
    const { spawnSync } = require("child_process");
    const editor = process.env.EDITOR || "vi";
    const filePath = resolveProjectPath("invoices", `${invoiceId}.yaml`);

    if (!fs.existsSync(filePath)) {
        console.error(`\n❌ Invoice not found: ${invoiceId}\n`);
        process.exit(1);
    }

    spawnSync(editor, [filePath], { stdio: "inherit" });
    console.log("\n✅ Invoice updated\n");
}

async function removeInvoice(invoiceId) {
    const { confirm } = await inquirer.prompt([
        {
            type: "confirm",
            name: "confirm",
            message: `Delete invoice ${invoiceId}?`,
            default: false,
        },
    ]);

    if (!confirm) {
        console.log("\nCancelled\n");
        return;
    }

    const filePath = resolveProjectPath("invoices", `${invoiceId}.yaml`);
    if (deleteFile(filePath)) {
        console.log(`\n✅ Invoice ${invoiceId} deleted\n`);
    } else {
        console.error(`\n❌ Invoice not found: ${invoiceId}\n`);
        process.exit(1);
    }
}

async function generateInvoice(invoiceId, options) {
    try {
        if (!options.quiet)
            console.log(`\n📄 Generating invoice: ${invoiceId}\n`);

        const result = await invoiceProcessor.processInvoice(invoiceId, {
            dryRun: options.dryRun,
            noSend: !options.send,  // --no-send flag sets options.send to false
            output: options.output,
        });

        if (!options.quiet) {
            console.log(`✅ Invoice ${result.invoiceNumber} generated`);
            console.log(`   PDF: ${result.pdfPath}`);
            if (result.deliveryInfo) {
                console.log(
                    `   Email: ${result.deliveryInfo.status} to ${result.deliveryInfo.to}`
                );
            }
            if (result.archivePath) {
                console.log(`   Archive: ${result.archivePath}`);
            }
            console.log("");
        }

        if (options.preview) {
            const { exec } = require("child_process");
            exec(`start "" "${result.pdfPath}"`, (err) => {
                if (err) console.log(`\nPDF saved to: ${result.pdfPath}`);
            });
        }
    } catch (err) {
        console.error(`\n❌ ${err.message}\n`);
        process.exit(1);
    }
}

module.exports = {
    createInvoice,
    listInvoices,
    showInvoice,
    editInvoice,
    removeInvoice,
    generateInvoice,
};
