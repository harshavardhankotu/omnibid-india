import PDFDocument from "pdfkit";
import { Response } from "express";

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  sacCode: "9954" | "9983";
  isInterState: boolean;
  buyer: {
    name: string;
    city: string;
    state: string;
    pan: string;
    gstin?: string;
  };
  provider: {
    name: string;
    city: string;
    state: string;
    pan: string;
    gstin?: string;
  };
  requirementTitle: string;
  baseAmount: number;
  tdsDeducted: number;
}

export class InvoiceService {
  /**
   * Generates and streams an Indian Works Contract GST Tax Invoice directly into Express Response.
   */
  static generateGSTInvoice(data: InvoiceData, res: Response): void {
    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Invoice_${data.invoiceNumber}.pdf"`);

    doc.pipe(res);

    // Header & Branding
    doc.fillColor("#1E293B").fontSize(20).text("OMNIBID INDIA ESCROW PLATFORM", { align: "left" });
    doc.fontSize(10).fillColor("#64748B").text("Unified B2B Escrow Works Contract Tax Invoice", { align: "left" });
    doc.moveDown(1.5);

    // Invoice Meta Grid
    doc.rect(40, doc.y, 515, 50).fillAndStroke("#F8FAFC", "#E2E8F0");
    const metaY = doc.y + 10;
    doc.fillColor("#0F172A").fontSize(9);
    doc.text(`Invoice No: ${data.invoiceNumber}`, 50, metaY);
    doc.text(`Invoice Date: ${data.invoiceDate}`, 50, metaY + 16);
    doc.text(`SAC Code: ${data.sacCode} (Works Contract / IT Consultancy)`, 260, metaY);
    doc.text(`Supply Type: ${data.isInterState ? "Inter-State (IGST)" : "Intra-State (CGST + SGST)"}`, 260, metaY + 16);
    doc.moveDown(4);

    // Buyer & Provider Details
    const partiesY = doc.y;
    doc.fontSize(11).fillColor("#0F172A").text("BILL FROM (Contractor / Provider):", 40, partiesY);
    doc.fontSize(9).fillColor("#334155");
    doc.text(data.provider.name, 40, partiesY + 16);
    doc.text(`City / State: ${data.provider.city}, ${data.provider.state}`, 40, partiesY + 30);
    doc.text(`PAN: ${data.provider.pan}`, 40, partiesY + 44);
    doc.text(`GSTIN: ${data.provider.gstin || "URP (Unregistered Person)"}`, 40, partiesY + 58);

    doc.fontSize(11).fillColor("#0F172A").text("BILL TO (Client / Buyer):", 300, partiesY);
    doc.fontSize(9).fillColor("#334155");
    doc.text(data.buyer.name, 300, partiesY + 16);
    doc.text(`City / State: ${data.buyer.city}, ${data.buyer.state}`, 300, partiesY + 30);
    doc.text(`PAN: ${data.buyer.pan}`, 300, partiesY + 44);
    doc.text(`GSTIN: ${data.buyer.gstin || "URP (Unregistered Person)"}`, 300, partiesY + 58);

    doc.moveDown(5);

    // Tax Math Calculations
    const base = data.baseAmount;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (data.isInterState) {
      igst = Math.round(base * 0.18 * 100) / 100; // 18% IGST
    } else {
      cgst = Math.round(base * 0.09 * 100) / 100; // 9% CGST
      sgst = Math.round(base * 0.09 * 100) / 100; // 9% SGST
    }

    const totalTax = igst + cgst + sgst;
    const grossTotal = base + totalTax;
    const netPayable = grossTotal - data.tdsDeducted;

    // Line Items Table
    const tableTop = doc.y + 10;
    doc.rect(40, tableTop, 515, 20).fill("#E2E8F0");
    doc.fillColor("#0F172A").fontSize(9);
    doc.text("Description of Works / Contract", 45, tableTop + 5);
    doc.text("SAC", 320, tableTop + 5);
    doc.text("Rate", 380, tableTop + 5);
    doc.text("Amount (INR)", 450, tableTop + 5);

    doc.rect(40, tableTop + 20, 515, 30).stroke("#CBD5E1");
    doc.text(data.requirementTitle, 45, tableTop + 28, { width: 260 });
    doc.text(data.sacCode, 320, tableTop + 28);
    doc.text("18%", 380, tableTop + 28);
    doc.text(`Rs. ${base.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 450, tableTop + 28);

    // Summary Section
    let currY = tableTop + 65;
    const drawSummaryRow = (label: string, value: string, isBold = false) => {
      if (isBold) doc.font("Helvetica-Bold");
      else doc.font("Helvetica");
      doc.text(label, 300, currY);
      doc.text(value, 450, currY, { align: "left" });
      currY += 16;
    };

    drawSummaryRow("Taxable Base Value:", `Rs. ${base.toFixed(2)}`);
    if (data.isInterState) {
      drawSummaryRow("Integrated GST (IGST 18%):", `Rs. ${igst.toFixed(2)}`);
    } else {
      drawSummaryRow("Central GST (CGST 9%):", `Rs. ${cgst.toFixed(2)}`);
      drawSummaryRow("State GST (SGST 9%):", `Rs. ${sgst.toFixed(2)}`);
    }
    drawSummaryRow("Total GST Tax:", `Rs. ${totalTax.toFixed(2)}`);
    drawSummaryRow("Gross Total (with GST):", `Rs. ${grossTotal.toFixed(2)}`, true);
    drawSummaryRow("Less TDS (Sec 194C/J 2%):", `- Rs. ${data.tdsDeducted.toFixed(2)}`);
    drawSummaryRow("Net Remitted to Escrow:", `Rs. ${netPayable.toFixed(2)}`, true);

    // Footer
    doc.moveDown(4);
    doc.fontSize(8).fillColor("#94A3B8");
    doc.text(
      "This is a system-generated computer invoice issued pursuant to the OmniBid Escrow Trust Agreement and Section 31 of the CGST Act, 2017.",
      40,
      doc.page.height - 50,
      { align: "center", width: 515 }
    );

    doc.end();
  }
}
