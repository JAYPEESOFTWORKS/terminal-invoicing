const inquirer = require("inquirer");
const path = require("path");
const yaml = require("js-yaml");
const {
    ensureDir,
    writeFileAtomic,
    resolveProjectPath,
} = require("../utils/file-utils");
const logger = require("../utils/logger");
/**
 * Init Command
 * Interactive setup wizard for first-time configuration
 */
async function initCommand() {
    console.log("\n✨ Welcome to Terminal Invoicing CLI Setup\n");

    try {
        // Company information
        console.log("📋 Company Information\n");

        const companyAnswers = await inquirer.prompt([
            {
                type: "input",
                name: "name",
                message: "Company name:",
                validate: (input) =>
                    input.trim().length > 0 || "Company name is required",
            },
            {
                type: "input",
                name: "email",
                message: "Company email (for billing):",
                validate: (input) => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return emailRegex.test(input) || "Valid email is required";
                },
            },
        ]);

        // Company info lines
        console.log(
            "\nEnter company address/contact info (one line at a time, empty line to finish):"
        );
        const infoLines = [];
        let lineNum = 1;

        while (true) {
            const { line } = await inquirer.prompt([
                {
                    type: "input",
                    name: "line",
                    message: `Line ${lineNum}:`,
                },
            ]);

            if (line.trim() === "") break;
            infoLines.push(line.trim());
            lineNum++;
        }

        const { logoPath } = await inquirer.prompt([
            {
                type: "input",
                name: "logoPath",
                message: "Logo file path (relative to project root, optional):",
                default: "assets/logo.png",
            },
        ]);

        // Starting invoice number
        const { startingNumber } = await inquirer.prompt([
            {
                type: "number",
                name: "startingNumber",
                message: "Starting invoice number:",
                default: 1,
                validate: (input) => input >= 1 || "Must be at least 1",
            },
        ]);

        // Email configuration
        console.log("\n📧 Email Configuration\n");

        const emailAnswers = await inquirer.prompt([
            {
                type: "list",
                name: "provider",
                message: "Email provider:",
                choices: ["mailgun"],
                default: "mailgun",
            },
            {
                type: "input",
                name: "mailgun_api_key",
                message: "Mailgun API key:",
                when: (answers) => answers.provider === "mailgun",
                validate: (input) =>
                    input.trim().length > 0 || "API key is required",
            },
            {
                type: "input",
                name: "mailgun_domain",
                message: "Mailgun domain:",
                when: (answers) => answers.provider === "mailgun",
                validate: (input) =>
                    input.trim().length > 0 || "Domain is required",
            },
        ]);

        // Create config directory structure
        const configDir = resolveProjectPath("config");
        console.log("DEBUG: configDir =", configDir);
        console.log("DEBUG: Creating directories...");

        ensureDir(configDir);
        console.log("DEBUG: Created", configDir);

        ensureDir(resolveProjectPath("customers"));
        ensureDir(resolveProjectPath("items"));
        ensureDir(resolveProjectPath("invoices"));
        ensureDir(resolveProjectPath("history"));
        ensureDir(resolveProjectPath("assets"));

        console.log("DEBUG: All directories created");

        // Save company config
        const companyConfig = {
            name: companyAnswers.name,
            info_lines: infoLines,
            logo_path: logoPath || "",
            email: companyAnswers.email,
        };

        const companyPath = path.join(configDir, "company.yaml");
        console.log("DEBUG: Writing company config to:", companyPath);

        writeFileAtomic(companyPath, yaml.dump(companyConfig));

        console.log("DEBUG: Company config written");

        // Save email config
        const emailConfig = {
            provider: emailAnswers.provider,
            mailgun: {
                api_key: emailAnswers.mailgun_api_key,
                domain: emailAnswers.mailgun_domain,
                from: companyAnswers.email,
            },
        };

        writeFileAtomic(
            path.join(configDir, "email.yaml"),
            yaml.dump(emailConfig)
        );

        // Save default email template
        const emailTemplate = {
            subject: "Invoice {{invoice_number}} from {{company_name}}",
            body:
                `Hello {{customer_name}},

Please find attached invoice {{invoice_number}} for {{invoice_month}}.

Invoice Total: ` +
                "${{total_amount}}" +
                `
Due Date: {{due_date}}

Thank you for your business!

Best regards,
{{company_name}}`,
        };

        writeFileAtomic(
            path.join(configDir, "email-template.yaml"),
            yaml.dump(emailTemplate)
        );

        // Save default invoice template
        const invoiceTemplate = {
            layout: "default",
            layout_config: {
                primary_color: "#000000",
                text_color: "#000000",
                line_color: "#000000",
                font_family: "Helvetica",
                font_size_base: 10,
                font_size_header: 24,
                font_size_metadata: 10,
                line_height: 12,
                item_row_height: 25,
                margins: {
                    top: 72,
                    bottom: 72,
                    left: 72,
                    right: 72,
                },
            },
        };

        writeFileAtomic(
            path.join(configDir, "invoice-template.yaml"),
            yaml.dump(invoiceTemplate)
        );

        // Save state
        const state = {
            next_invoice_number: startingNumber,
            last_run: null,
        };

        writeFileAtomic(path.join(configDir, "state.yaml"), yaml.dump(state));

        logger.info("Terminal Invoicing initialized successfully");

        console.log("\n✅ Setup complete!\n");
        console.log("Next steps:");
        console.log("  1. Add customers: Terminal Invoicing customer add");
        console.log("  2. Add items: Terminal Invoicing item add");
        console.log("  3. Create invoices: Terminal Invoicing invoice create");
        console.log(
            "  4. Setup automation: Terminal Invoicing schedule setup\n"
        );
    } catch (err) {
        console.error(`\n❌ Setup failed: ${err.message}\n`);
        logger.error("Init command failed", { error: err });
        process.exit(1);
    }
}

module.exports = initCommand;
