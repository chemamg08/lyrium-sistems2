import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import { getVatRate, getTaxLabel } from '../utils/vatRates.js';

export interface InvoiceData {
  invoiceNumber: string;        // LY-2026-0001
  date: Date;
  // Client data (from Account billing fields)
  clientName: string;
  clientAddress: string;
  clientPhone: string;
  clientEmail: string;
  clientCIF: string;
  clientNotes: string;
  // Line item
  concept: string;              // "Suscripción Lyrium — Plan Starter Mensual"
  periodStart: string;          // "28/03/2026"
  periodEnd: string;            // "28/04/2026"
  totalAmount: number;          // Price including tax (e.g. 197)
  // Tax
  countryCode: string;          // "ES" → for VAT rate lookup
  // Payment
  cardBrand: string;            // "visa"
  cardLast4: string;            // "4242"
  // Owner (from .env)
  ownerName: string;
  ownerNIF: string;
  ownerAddress: string;
}

function formatDate(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatCurrency(amount: number): string {
  return amount.toFixed(2).replace('.', ',') + ' €';
}

// ── Currency equivalence for non-EUR countries ──

interface LocalCurrency {
  code: string;
  symbol: string;
  rate: number; // 1 EUR = X local
  position: 'before' | 'after';
}

const CURRENCY_MAP: Record<string, LocalCurrency> = {
  USD: { code: 'USD', symbol: '$', rate: 1.08, position: 'before' },
  GBP: { code: 'GBP', symbol: '£', rate: 0.86, position: 'before' },
  PLN: { code: 'PLN', symbol: 'PLN', rate: 4.32, position: 'after' },
  SEK: { code: 'SEK', symbol: 'kr', rate: 11.20, position: 'after' },
  NOK: { code: 'NOK', symbol: 'kr', rate: 11.50, position: 'after' },
  DKK: { code: 'DKK', symbol: 'kr', rate: 7.46, position: 'after' },
  CZK: { code: 'CZK', symbol: 'CZK', rate: 25.30, position: 'after' },
  HUF: { code: 'HUF', symbol: 'Ft', rate: 395, position: 'after' },
  RON: { code: 'RON', symbol: 'lei', rate: 4.97, position: 'after' },
  BGN: { code: 'BGN', symbol: 'BGN', rate: 1.96, position: 'after' },
  CHF: { code: 'CHF', symbol: 'CHF', rate: 0.94, position: 'before' },
  BRL: { code: 'BRL', symbol: 'R$', rate: 5.50, position: 'before' },
  MXN: { code: 'MXN', symbol: '$', rate: 18.50, position: 'before' },
  ARS: { code: 'ARS', symbol: '$', rate: 950, position: 'before' },
  CLP: { code: 'CLP', symbol: '$', rate: 1020, position: 'before' },
  COP: { code: 'COP', symbol: '$', rate: 4300, position: 'before' },
  PEN: { code: 'PEN', symbol: 'S/', rate: 4.05, position: 'before' },
  UYU: { code: 'UYU', symbol: '$U', rate: 42, position: 'before' },
  AUD: { code: 'AUD', symbol: 'A$', rate: 1.65, position: 'before' },
  NZD: { code: 'NZD', symbol: 'NZ$', rate: 1.78, position: 'before' },
  CAD: { code: 'CAD', symbol: 'C$', rate: 1.47, position: 'before' },
  SGD: { code: 'SGD', symbol: 'S$', rate: 1.45, position: 'before' },
};

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  GB: 'GBP', US: 'USD', PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', CH: 'CHF',
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP',
  PE: 'PEN', UY: 'UYU', PA: 'USD', DO: 'USD', EC: 'USD',
  BO: 'USD', PY: 'USD', CR: 'USD', GT: 'USD', HN: 'USD',
  SV: 'USD', NI: 'USD', AU: 'AUD', NZ: 'NZD', CA: 'CAD', SG: 'SGD',
};

function getLocalCurrency(countryCode: string): LocalCurrency | null {
  const code = COUNTRY_TO_CURRENCY[countryCode?.toUpperCase()];
  return code ? (CURRENCY_MAP[code] || null) : null;
}

function formatLocalCurrency(eurAmount: number, lc: LocalCurrency): string {
  const converted = eurAmount * lc.rate;
  const formatted = converted.toFixed(2).replace('.', ',');
  return lc.position === 'before'
    ? `${lc.symbol}${formatted}`
    : `${formatted} ${lc.symbol}`;
}

/**
 * Generate a PDF invoice buffer matching the LYRIUM design:
 * - Black/gray/white only (no blue)
 * - Header: LYRIUM + FACTURA with number/date
 * - Client data section
 * - Concept/amount table
 * - Totals: base + tax + total
 * - Payment method with last 4 digits
 * - Footer: LYRIUM + owner info
 */
export function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 55, right: 55 },
        info: {
          Title: `Invoice ${data.invoiceNumber}`,
          Author: 'Lyrium',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const marginL = 55;
      const marginR = 55;
      const contentW = pageW - marginL - marginR;

      // ====== HEADER ======
      doc.y = 50;

      // LYRIUM text (left, large, bold, black)
      doc.font('Helvetica-Bold')
        .fontSize(48)
        .fillColor('#1a1a1a')
        .text('LYRIUM', marginL, 50);

      // INVOICE (right aligned)
      doc.font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#1a1a1a')
        .text('INVOICE', marginL, 55, { width: contentW, align: 'right' });

      // Invoice number & date (right aligned)
      doc.font('Helvetica')
        .fontSize(9)
        .fillColor('#666666')
        .text(`No: ${data.invoiceNumber}`, marginL, 80, { width: contentW, align: 'right' })
        .text(`Date: ${formatDate(data.date)}`, marginL, 93, { width: contentW, align: 'right' });

      // Separator line
      const sepY = 120;
      doc.moveTo(marginL, sepY)
        .lineTo(pageW - marginR, sepY)
        .lineWidth(0.5)
        .strokeColor('#d0d0d0')
        .stroke();

      // ====== CLIENT SECTION ======
      const clientY = 145;

      doc.font('Helvetica-Bold')
        .fontSize(7)
        .fillColor('#666666')
        .text('CLIENT DATA', marginL, clientY);

      let cy = clientY + 18;

      if (data.clientName) {
        doc.font('Helvetica-Bold')
          .fontSize(12)
          .fillColor('#1a1a1a')
          .text(data.clientName, marginL, cy);
        cy += 18;
      }

      doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');

      if (data.clientAddress) {
        doc.text(data.clientAddress, marginL, cy);
        cy += 14;
      }
      if (data.clientPhone) {
        doc.text(`Phone: ${data.clientPhone}`, marginL, cy);
        cy += 14;
      }
      if (data.clientEmail) {
        doc.text(data.clientEmail, marginL, cy);
        cy += 14;
      }
      if (data.clientCIF) {
        doc.font('Helvetica').fontSize(8).fillColor('#666666')
          .text(`Tax ID: ${data.clientCIF}`, marginL, cy + 4);
        cy += 16;
      }
      if (data.clientNotes) {
        doc.font('Helvetica').fontSize(8).fillColor('#666666')
          .text(data.clientNotes, marginL, cy + 2, { width: contentW / 2 });
        cy += 14;
      }

      // ====== TABLE SECTION ======
      const tableY = Math.max(cy + 30, 280);

      // Table header background
      doc.rect(marginL, tableY, contentW, 28)
        .fillColor('#f5f5f5')
        .fill();

      // Column headers
      doc.font('Helvetica-Bold')
        .fontSize(7)
        .fillColor('#374151')
        .text('DESCRIPTION', marginL + 12, tableY + 10)
        .text('AMOUNT', marginL + contentW - 90, tableY + 10, { width: 78, align: 'right' });

      // Row
      const rowY = tableY + 28;

      // Concept line
      doc.font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#1a1a1a')
        .text(data.concept, marginL + 12, rowY + 14);

      doc.font('Helvetica')
        .fontSize(8)
        .fillColor('#666666')
        .text(`Period: ${data.periodStart} — ${data.periodEnd}`, marginL + 12, rowY + 30);

      // Amount (right)
      doc.font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#1a1a1a')
        .text(formatCurrency(data.totalAmount), marginL + contentW - 90, rowY + 14, { width: 78, align: 'right' });

      // Row bottom border
      const rowBottom = rowY + 50;
      doc.moveTo(marginL, rowBottom)
        .lineTo(pageW - marginR, rowBottom)
        .lineWidth(0.3)
        .strokeColor('#e0e0e0')
        .stroke();

      // ====== TOTALS ======
      const vatRate = getVatRate(data.countryCode);
      const taxLabel = getTaxLabel(data.countryCode);

      let baseAmount: number;
      let taxAmount: number;

      if (vatRate > 0) {
        baseAmount = data.totalAmount / (1 + vatRate / 100);
        taxAmount = data.totalAmount - baseAmount;
      } else {
        baseAmount = data.totalAmount;
        taxAmount = 0;
      }

      const totalsX = marginL + contentW - 200;
      const totalsW = 200;
      let ty = rowBottom + 25;

      // Tax base
      doc.font('Helvetica')
        .fontSize(8)
        .fillColor('#666666')
        .text('Tax base', totalsX, ty);
      doc.font('Helvetica')
        .fontSize(8)
        .fillColor('#1a1a1a')
        .text(formatCurrency(baseAmount), totalsX, ty, { width: totalsW, align: 'right' });
      ty += 18;

      // Tax line
      if (vatRate > 0) {
        const vatStr = Number.isInteger(vatRate) ? `${vatRate}%` : `${vatRate.toFixed(1)}%`;
        doc.font('Helvetica')
          .fontSize(8)
          .fillColor('#666666')
          .text(`${taxLabel} (${vatStr})`, totalsX, ty);
        doc.font('Helvetica')
          .fontSize(8)
          .fillColor('#1a1a1a')
          .text(formatCurrency(taxAmount), totalsX, ty, { width: totalsW, align: 'right' });
        ty += 18;
      } else {
        doc.font('Helvetica')
          .fontSize(8)
          .fillColor('#666666')
          .text('Tax exempt', totalsX, ty);
        doc.font('Helvetica')
          .fontSize(8)
          .fillColor('#1a1a1a')
          .text(formatCurrency(0), totalsX, ty, { width: totalsW, align: 'right' });
        ty += 18;
      }

      // Divider
      ty += 4;
      doc.moveTo(totalsX, ty)
        .lineTo(totalsX + totalsW, ty)
        .lineWidth(0.3)
        .strokeColor('#d0d0d0')
        .stroke();
      ty += 10;

      // TOTAL
      doc.font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#1a1a1a')
        .text('TOTAL', totalsX, ty);
      doc.font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#1a1a1a')
        .text(formatCurrency(data.totalAmount), totalsX, ty - 2, { width: totalsW, align: 'right' });

      // Approximate equivalence in local currency (non-EUR countries)
      const localCurrency = getLocalCurrency(data.countryCode);
      let equivOffset = 0;
      if (localCurrency) {
        equivOffset = 18;
        doc.font('Helvetica-Oblique')
          .fontSize(7.5)
          .fillColor('#999999')
          .text(
            `~ ${formatLocalCurrency(data.totalAmount, localCurrency)}  (approximate equivalent)`,
            totalsX, ty + 16, { width: totalsW, align: 'right' }
          );
      }

      // ====== PAYMENT METHOD ======
      const payY = ty + 45 + equivOffset;
      const brandDisplay = data.cardBrand ? (data.cardBrand.charAt(0).toUpperCase() + data.cardBrand.slice(1)) : 'Card';
      doc.font('Helvetica')
        .fontSize(8)
        .fillColor('#666666')
        .text(`Payment method: ${brandDisplay} •••• ${data.cardLast4}`, marginL + 12, payY);

      // ====== FOOTER ======
      const footerY = doc.page.height - 120;

      // Separator
      doc.moveTo(marginL, footerY)
        .lineTo(pageW - marginR, footerY)
        .lineWidth(0.3)
        .strokeColor('#d0d0d0')
        .stroke();

      // LYRIUM centered
      const lyriumW = doc.font('Helvetica-Bold').fontSize(36).widthOfString('LYRIUM');
      const lyriumX = (pageW - lyriumW) / 2;
      doc.font('Helvetica-Bold')
        .fontSize(36)
        .fillColor('#1a1a1a')
        .text('LYRIUM', lyriumX, footerY + 16);

      // Owner info centered below LYRIUM, same width as LYRIUM text
      const ownerLine = `${data.ownerName} · Tax ID: ${data.ownerNIF} · ${data.ownerAddress}`;
      const ownerX = (pageW - lyriumW) / 2;
      doc.font('Helvetica')
        .fontSize(4.5)
        .fillColor('#999999')
        .text(ownerLine, ownerX, footerY + 52, { width: lyriumW, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Send the invoice PDF via email using the system Hostinger SMTP.
 */
export async function sendInvoiceEmail(
  recipientEmail: string,
  invoiceNumber: string,
  pdfBuffer: Buffer
): Promise<void> {
  const port = Number(process.env.SYSTEM_EMAIL_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SYSTEM_EMAIL_HOST || 'smtp-relay.brevo.com',
    port,
    secure: port === 465,
    auth: {
      user: process.env.SYSTEM_EMAIL_LOGIN || process.env.SYSTEM_EMAIL_USER,
      pass: process.env.SYSTEM_EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Lyrium" <${process.env.SYSTEM_EMAIL_USER}>`,
    to: recipientEmail,
    subject: `Invoice ${invoiceNumber} — Lyrium`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 32px; font-weight: bold; color: #1a1a1a; margin-bottom: 8px;">LYRIUM</h1>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 14px; color: #333;">Please find attached your invoice <strong>${invoiceNumber}</strong>.</p>
        <p style="font-size: 14px; color: #333;">Thank you for choosing Lyrium.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 11px; color: #999;">This is an automated email. Please do not reply to this message.</p>
      </div>
    `,
    attachments: [
      {
        filename: `${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

/**
 * Build the invoice number: LY-YYYY-NNNN
 */
export function buildInvoiceNumber(nextNumber: number): string {
  const year = new Date().getFullYear();
  const seq = String(nextNumber).padStart(4, '0');
  return `LY-${year}-${seq}`;
}

/**
 * Build the concept line for the invoice.
 */
export function buildConcept(plan: string, interval: string): string {
  const planName = plan === 'advanced' ? 'Advanced' : 'Starter';
  const intervalName = interval === 'annual' ? 'Annual' : 'Monthly';
  return `Lyrium Subscription — ${planName} Plan ${intervalName}`;
}

/**
 * Format a date as DD/MM/YYYY
 */
export function formatShortDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}
