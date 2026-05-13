import { Request, Response } from 'express';
import { Invoice } from '../models/Invoice.js';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatAmount = (value: unknown): string => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : '0.00';
};

export async function getPublicInvoice(req: Request, res: Response) {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findOne({ publicId: invoiceId });
    if (!invoice) {
      return res.status(404).type('html').send(`
        <!DOCTYPE html>
        <html><head><title>Invoice Not Found</title>
        <style>body{font-family:system-ui,sans-serif;max-width:600px;margin:60px auto;padding:20px;text-align:center;color:#333}
        h1{color:#1a1a1a}.error{color:#e53e3e}</style></head>
        <body><h1>LYRIUM</h1><hr><p class="error">Invoice not found</p>
        <p>The invoice you are looking for does not exist or has been removed.</p></body></html>
      `);
    }

    const invoiceNumber = escapeHtml(invoice.invoiceNumber);
    const invoiceDate = escapeHtml(invoice.date);
    const issuerName = escapeHtml(invoice.firmName || '—');
    const issuerAddress = escapeHtml(invoice.firmAddress || '—');
    const issuerPhone = escapeHtml(invoice.firmPhone || '—');
    const issuerNif = escapeHtml(invoice.firmNIF || '—');
    const clientName = escapeHtml(invoice.clientName || '—');
    const clientEmail = escapeHtml(invoice.clientEmail || '—');
    const clientPhone = escapeHtml(invoice.clientPhone || '—');
    const baseAmount = formatAmount(invoice.baseAmount);
    const taxAmount = formatAmount(invoice.taxAmount);
    const taxRateText = invoice.taxRate != null ? escapeHtml(invoice.taxRate) + '%' : '—';
    const totalAmount = formatAmount(invoice.totalAmount);
    const paymentMethod = escapeHtml(invoice.paymentMethod || '—');
    const huella = invoice.huella ? escapeHtml(invoice.huella) : '';
    const huellaAnterior = invoice.huellaAnterior ? escapeHtml(invoice.huellaAnterior) : '';

    const linesHtml = (Array.isArray(invoice.lines) ? invoice.lines : []).map((line) => {
      const concept = escapeHtml(line.concept || '—');
      const quantity = escapeHtml(line.quantity ?? '—');
      const price = formatAmount(line.price);
      const subtotal = formatAmount(line.subtotal);
      return `<tr>
          <td>${concept}</td>
          <td style="text-align:center">${quantity}</td>
          <td style="text-align:right">${price} €</td>
          <td style="text-align:right">${subtotal} €</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${invoiceNumber} — Lyrium</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; color: #1a1a1a; line-height: 1.5; }
    .container { max-width: 800px; margin: 40px auto; padding: 0 20px; }
    .header { background: #1a1a1a; color: white; padding: 32px; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
    .header-brand h1 { font-size: 32px; letter-spacing: 4px; font-weight: 800; }
    .header-brand p { opacity: 0.7; margin-top: 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
    .header-meta { text-align: right; }
    .header-meta .factura-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; margin-bottom: 4px; }
    .header-meta .factura-number { font-size: 18px; font-weight: 700; }
    .header-meta .factura-date { font-size: 13px; opacity: 0.8; margin-top: 2px; }
    .card { background: white; padding: 32px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .parties { display: flex; justify-content: space-between; gap: 40px; flex-wrap: wrap; margin-bottom: 32px; }
    .party { flex: 1; min-width: 220px; }
    .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #888; margin-bottom: 10px; font-weight: 600; }
    .party p { font-size: 14px; color: #333; margin-bottom: 4px; }
    .party p.party-name { font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { padding: 10px 8px; font-size: 14px; }
    thead th { text-align: left; border-bottom: 2px solid #e5e5e5; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 600; }
    tbody tr { border-bottom: 1px solid #f0f0f0; }
    tbody tr:last-child { border-bottom: 1px solid #e5e5e5; }
    .totals { max-width: 320px; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #555; }
    .totals-row.total-final { font-size: 20px; font-weight: 700; color: #1a1a1a; border-top: 2px solid #e5e5e5; margin-top: 6px; padding-top: 10px; }
    .payment { margin-top: 20px; font-size: 14px; color: #555; }
    .payment strong { color: #1a1a1a; font-weight: 600; }
    .hash-section { background: #f9f9f9; border-radius: 8px; padding: 16px; margin-top: 24px; }
    .hash-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px; font-weight: 600; }
    .hash { font-family: 'Courier New', monospace; font-size: 11px; word-break: break-all; color: #333; background: white; padding: 8px; border-radius: 4px; border: 1px solid #eee; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; padding-bottom: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-brand">
        <h1>LYRIUM</h1>
        <p>Factura verificable</p>
      </div>
      <div class="header-meta">
        <div class="factura-label">Factura</div>
        <div class="factura-number">${invoiceNumber}</div>
        <div class="factura-date">${invoiceDate}</div>
      </div>
    </div>
    <div class="card">
      <div class="parties">
        <div class="party">
          <h3>Emisor</h3>
          <p class="party-name">${issuerName}</p>
          <p>${issuerAddress}</p>
          <p>${issuerPhone}</p>
          <p>NIF: ${issuerNif}</p>
        </div>
        <div class="party">
          <h3>Cliente</h3>
          <p class="party-name">${clientName}</p>
          <p>${clientEmail}</p>
          <p>${clientPhone}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th style="text-align:center">Cantidad</th>
            <th style="text-align:right">Precio</th>
            <th style="text-align:right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml || `<tr><td colspan="4" style="text-align:center;color:#999;padding:16px">—</td></tr>`}
        </tbody>
      </table>

      <div class="totals">
        <div class="totals-row"><span>Base Imponible</span><span>${baseAmount} €</span></div>
        <div class="totals-row"><span>Impuestos (${taxRateText})</span><span>${taxAmount} €</span></div>
        <div class="totals-row total-final"><span>Total</span><span>${totalAmount} €</span></div>
      </div>

      <div class="payment">
        <strong>Método de pago:</strong> ${paymentMethod}
      </div>

      ${huella ? `
      <div class="hash-section">
        <h3>Huella digital</h3>
        <p class="hash">${huella}</p>
        ${huellaAnterior ? `
        <h3 style="margin-top:12px">Huella anterior</h3>
        <p class="hash">${huellaAnterior}</p>
        ` : ''}
      </div>
      ` : ''}
    </div>
    <div class="footer">
      <p>Lyrium Systems · lyrium.io</p>
    </div>
  </div>
</body>
</html>`;

    res.type('html').send(html);
  } catch (error) {
    console.error('[publicInvoice] error:', error);
    res.status(500).type('html').send(`
      <!DOCTYPE html>
      <html><head><title>Error</title>
      <style>body{font-family:system-ui,sans-serif;max-width:600px;margin:60px auto;padding:20px;text-align:center;color:#333}
      h1{color:#1a1a1a}.error{color:#e53e3e}</style></head>
      <body><h1>LYRIUM</h1><hr><p class="error">Internal server error</p></body></html>
    `);
  }
}
