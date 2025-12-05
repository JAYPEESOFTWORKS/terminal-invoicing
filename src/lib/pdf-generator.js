const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const layoutManager = require("./layout-manager");
const logger = require("../utils/logger");
const { ensureDir } = require("../utils/file-utils");

/**
 * PDF Generator
 * Generates PDF invoices using layout plugins
 */
class PDFGenerator {
    /**
     * Generate a PDF invoice
     * @param {object} invoiceData - Complete invoice data
     * @param {string} outputPath - Path to save PDF
     * @param {object} options - Generation options
     * @returns {Promise<string>} Path to generated PDF
     */
    async generate(invoiceData, outputPath, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                // Ensure output directory exists
                ensureDir(path.dirname(outputPath));

                // Get layout
                const layoutName =
                    options.layout || invoiceData.layout || "default";
                const layout = layoutManager.getLayout(layoutName);

                // Merge layout config
                const layoutConfig = {
                    ...(layout.configSchema || {}),
                    ...options.layoutConfig,
                    ...(invoiceData.layoutConfig || {}),
                };

                // Create PDF document
                const doc = new PDFDocument({
                    size: "LETTER",
                    margins: layoutConfig.margins || {
                        top: 72,
                        bottom: 72,
                        left: 72,
                        right: 72,
                    },
                    bufferPages: true, // Enable page buffering for page numbers
                });

                // Pipe to file
                const stream = fs.createWriteStream(outputPath);
                doc.pipe(stream);

                // Render using layout
                try {
                    layout.render(doc, invoiceData, layoutConfig);
                } catch (err) {
                    throw new Error(`Layout rendering failed: ${err.message}`);
                }

                // Finalize PDF
                doc.end();

                // Wait for stream to finish
                stream.on("finish", () => {
                    logger.info(`Generated PDF: ${outputPath}`);
                    resolve(outputPath);
                });

                stream.on("error", (err) => {
                    reject(new Error(`Failed to write PDF: ${err.message}`));
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Generate and open PDF in default viewer (for preview)
     * @param {object} invoiceData - Complete invoice data
     * @param {object} options - Generation options
     * @returns {Promise<string>} Path to generated PDF
     */
    async preview(invoiceData, options = {}) {
        const { exec } = require("child_process");
        const os = require("os");
        const tempPath = path.join(
            os.tmpdir(),
            `invoice-preview-${Date.now()}.pdf`
        );

        await this.generate(invoiceData, tempPath, {
            layout: options.layout,
            layoutConfig: options.layoutConfig,
        });

        // Open in default viewer
        const platform = process.platform;
        let openCommand;

        if (platform === "darwin") {
            openCommand = "open";
        } else if (platform === "win32") {
            openCommand = "start";
        } else {
            openCommand = "xdg-open";
        }

        exec(`${openCommand} "${tempPath}"`, (err) => {
            if (err) {
                logger.warn(`Failed to open PDF viewer: ${err.message}`);
                console.log(`\nPDF saved to: ${tempPath}`);
            }
        });

        return tempPath;
    }

    /**
     * Validate invoice data structure
     * @param {object} data - Invoice data
     * @throws {Error} If data is invalid
     */
    validateInvoiceData(data) {
        const required = ["company", "customer", "invoice", "items", "totals"];

        for (const field of required) {
            if (!data[field]) {
                throw new Error(
                    `Invoice data missing required field: ${field}`
                );
            }
        }

        // Validate company
        if (!data.company.name || !Array.isArray(data.company.info_lines)) {
            throw new Error("Invalid company data");
        }

        // Validate customer
        if (!data.customer.name || !Array.isArray(data.customer.info_lines)) {
            throw new Error("Invalid customer data");
        }

        // Validate invoice metadata
        if (
            !data.invoice.number ||
            !data.invoice.date ||
            !data.invoice.due_date
        ) {
            throw new Error("Invalid invoice metadata");
        }

        // Validate items
        if (!Array.isArray(data.items) || data.items.length === 0) {
            throw new Error("Invoice must have at least one item");
        }

        // Validate totals
        if (typeof data.totals.total !== "number") {
            throw new Error("Invalid totals");
        }
    }
}

module.exports = new PDFGenerator();
