const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { formatCurrency } = require("../src/utils/formatters");
const logger = require("../src/utils/logger");
const { resolveProjectPath } = require("../src/utils/file-utils");

/**
 * Default Layout - Matches reference invoice exactly
 *
 * Layout features:
 * - Logo top-left
 * - "INVOICE" text top-right
 * - Company info right side
 * - Bill To section left side
 * - Invoice metadata right side
 * - Clean line items table (no borders)
 * - Two-line items (description + detail)
 * - Comment items (italic, full width)
 * - Proper page breaks
 */

const layout = {
    name: "default",
    description: "Clean, professional invoice layout matching reference design",
    author: "Terminal Invoicing",
    version: "1.0.0",

    /**
     * Render invoice to PDF
     * @param {PDFDocument} doc - PDFKit document
     * @param {object} data - Invoice data
     * @param {object} config - Layout configuration
     */
    render(doc, data, config) {
        const margins = config.margins || {
            top: 72,
            bottom: 72,
            left: 72,
            right: 72,
        };
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const contentWidth = pageWidth - margins.left - margins.right;

        let currentY = margins.top;

        // Track total pages for page numbering
        let isFirstPage = true;

        // Helper to add new page with header
        const addPageWithHeader = () => {
            doc.addPage();
            currentY = margins.top;

            // Add page number
            const range = doc.bufferedPageRange();
            const pageNum = range.start + range.count;

            doc.fontSize(8)
                .fillColor("#666666")
                .text(
                    `Page ${pageNum}`,
                    margins.left,
                    pageHeight - margins.bottom + 20,
                    { width: contentWidth, align: "center" }
                );

            isFirstPage = false;
            return currentY;
        };

        // Helper to check if we need a new page
        const checkPageBreak = (neededHeight) => {
            if (currentY + neededHeight > pageHeight - margins.bottom - 100) {
                addPageWithHeader();

                // Redraw table header on new page
                drawTableHeader();
                currentY += 30;
            }
        };

        currentY = margins.top;

        // Draw logo (at very top)
        const logoPath = data.company.logo_path
            ? resolveProjectPath(data.company.logo_path)
            : null;

        if (logoPath && fs.existsSync(logoPath)) {
            try {
                doc.image(logoPath, margins.left, margins.top, {
                    width: 100,
                    height: 100,
                    fit: [100, 100],
                });
            } catch (err) {
                logger.warn(`Failed to load logo: ${err.message}`);
            }
        }

        // "INVOICE" text - top right
        doc.fontSize(config.font_size_header || 24)
            .font("Helvetica-Bold")
            .fillColor(config.text_color || "#000000")
            .text("INVOICE", margins.left, margins.top, {
                width: contentWidth,
                align: "right",
            });

        currentY = margins.top + 40;

        // Company info - right aligned, below INVOICE
        const companyInfoX = pageWidth - margins.right - 200;
        let companyY = currentY;

        doc.fontSize(9)
            .font("Helvetica")
            .fillColor(config.text_color || "#000000");

        doc.text(data.company.name, companyInfoX, companyY, {
            width: 200,
            align: "right",
        });
        companyY += 11;

        data.company.info_lines.forEach((line) => {
            doc.text(line, companyInfoX, companyY, {
                width: 200,
                align: "right",
            });
            companyY += 11;
        });

        // Move currentY down past company info + extra space
        currentY = Math.max(companyY + 30, margins.top + 120);

        // Horizontal line below header
        doc.moveTo(margins.left, currentY)
            .lineTo(pageWidth - margins.right, currentY)
            .strokeColor(config.line_color || "#000000")
            .lineWidth(1)
            .stroke();

        currentY += 20;

        // Bill To section - left side
        doc.fontSize(config.font_size_base || 10)
            .font("Helvetica-Bold")
            .text("BILL TO", margins.left, currentY);

        currentY += config.line_height + 5;

        doc.font("Helvetica-Bold").text(
            data.customer.name,
            margins.left,
            currentY
        );
        currentY += config.line_height || 12;

        doc.font("Helvetica");
        data.customer.info_lines.forEach((line) => {
            doc.text(line, margins.left, currentY);
            currentY += config.line_height || 12;
        });

        // Invoice metadata - right side (aligned with Bill To)
        const metadataY =
            currentY -
            (data.customer.info_lines.length + 2) * (config.line_height || 12);
        const metadataX = companyInfoX;
        let metaY = metadataY;

        const metadataItems = [
            ["Invoice Number:", data.invoice.number],
            ["Invoice Date:", data.invoice.date],
            ["Payment Due:", data.invoice.due_date],
            ["Amount Due (USD):", formatCurrency(data.totals.total)],
        ];

        doc.fontSize(config.font_size_metadata || 10).font("Helvetica");

        metadataItems.forEach(([label, value]) => {
            doc.text(label, metadataX, metaY, { width: 100, continued: false });
            doc.font("Helvetica-Bold").text(value, metadataX + 100, metaY, {
                width: 100,
                align: "right",
            });
            doc.font("Helvetica");
            metaY += (config.line_height || 12) + 2;
        });

        currentY = Math.max(currentY, metaY) + 30;

        // Table header line
        doc.moveTo(margins.left, currentY)
            .lineTo(pageWidth - margins.right, currentY)
            .strokeColor(config.line_color || "#000000")
            .lineWidth(1)
            .stroke();

        currentY += 15;

        // Table header function (for reuse on new pages)
        const drawTableHeader = () => {
            const headerY = currentY;
            const qtyX = pageWidth - margins.right - 300;
            const priceX = pageWidth - margins.right - 200;
            const amountX = pageWidth - margins.right - 100;

            doc.fontSize(config.font_size_base || 10)
                .font("Helvetica-Bold")
                .fillColor(config.text_color || "#000000");

            doc.text("Items", margins.left, headerY);
            doc.text("Quantity", qtyX, headerY, { width: 80, align: "center" });
            doc.text("Price", priceX, headerY, { width: 80, align: "right" });
            doc.text("Amount", amountX, headerY, { width: 80, align: "right" });

            currentY = headerY + 20;
        };

        // Draw initial table header
        drawTableHeader();

        // Line items
        const qtyX = pageWidth - margins.right - 300;
        const priceX = pageWidth - margins.right - 200;
        const amountX = pageWidth - margins.right - 100;

        data.items.forEach((item, index) => {
            if (item.type === "comment") {
                // Comment item - full width, italic
                const itemHeight = 25;
                checkPageBreak(itemHeight);

                doc.fontSize(9)
                    .font("Helvetica-Oblique")
                    .fillColor("#666666")
                    .text(item.description, margins.left, currentY, {
                        width: contentWidth,
                    });

                currentY += itemHeight;
            } else {
                // Regular item - two lines if detail exists
                const itemHeight = item.detail ? 40 : 25;
                checkPageBreak(itemHeight);

                // Description (bold)
                doc.fontSize(config.font_size_base || 10)
                    .font("Helvetica-Bold")
                    .fillColor(config.text_color || "#000000")
                    .text(item.description, margins.left, currentY, {
                        width: qtyX - margins.left - 20,
                    });

                // Detail line (if present)
                if (item.detail) {
                    doc.fontSize(9)
                        .font("Helvetica")
                        .text(item.detail, margins.left, currentY + 12, {
                            width: qtyX - margins.left - 20,
                        });
                }

                // Quantity, Price, Amount
                doc.fontSize(config.font_size_base || 10)
                    .font("Helvetica")
                    .text(item.quantity.toString(), qtyX, currentY, {
                        width: 80,
                        align: "center",
                    })
                    .text(formatCurrency(item.rate), priceX, currentY, {
                        width: 80,
                        align: "right",
                    })
                    .text(formatCurrency(item.amount), amountX, currentY, {
                        width: 80,
                        align: "right",
                    });

                currentY += itemHeight;
            }
        });

        // Add horizontal line before totals
        currentY += 30;
        doc.moveTo(pageWidth - margins.right - 200, currentY)
            .lineTo(pageWidth - margins.right, currentY)
            .strokeColor(config.line_color || "#000000")
            .lineWidth(0.5)
            .stroke();

        currentY += 15;
        checkPageBreak(60);

        // Totals section - right aligned
        const totalsX = pageWidth - margins.right - 200;

        doc.fontSize(config.font_size_base || 10)
            .font("Helvetica-Bold")
            .fillColor(config.text_color || "#000000");

        doc.text("Total:", totalsX, currentY, { width: 100, align: "left" });
        doc.text(formatCurrency(data.totals.total), totalsX + 100, currentY, {
            width: 80,
            align: "right",
        });

        currentY += (config.line_height || 12) + 5;

        doc.text("Amount Due (USD):", totalsX, currentY, {
            width: 100,
            align: "left",
        });
        doc.text(formatCurrency(data.totals.total), totalsX + 100, currentY, {
            width: 80,
            align: "right",
        });

        // Update page numbers on all pages
        const range = doc.bufferedPageRange();
        if (range.count > 1) {
            for (let i = 0; i < range.count; i++) {
                doc.switchToPage(i);
                doc.fontSize(8)
                    .fillColor("#666666")
                    .text(
                        `Page ${i + 1} of ${range.count}`,
                        margins.left,
                        pageHeight - margins.bottom + 20,
                        { width: contentWidth, align: "center" }
                    );
            }
        }
    },
};

module.exports = layout;
