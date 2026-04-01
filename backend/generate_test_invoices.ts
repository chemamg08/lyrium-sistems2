import { generateInvoicePDF, InvoiceData } from './src/services/invoiceService.js';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test_invoices');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const baseData: Omit<InvoiceData, 'countryCode' | 'invoiceNumber'> = {
  date: new Date(),
  clientName: 'Test Company S.L.',
  clientAddress: '123 Example Street, City 12345',
  clientPhone: '+34 600 000 000',
  clientEmail: 'test@example.com',
  clientCIF: 'B12345678',
  clientNotes: '',
  concept: 'Lyrium Subscription — Starter Monthly Plan',
  periodStart: '01/07/2025',
  periodEnd: '01/08/2025',
  totalAmount: 197,
  cardBrand: 'visa',
  cardLast4: '4242',
  ownerName: 'Lyrium Systems S.L.',
  ownerNIF: 'B99999999',
  ownerAddress: 'Calle Ejemplo 1, 28001 Madrid, Spain',
};

const testCases: { country: string; label: string }[] = [
  { country: 'ES', label: 'Spain_EUR' },
  { country: 'GB', label: 'UK_GBP' },
  { country: 'PL', label: 'Poland_PLN' },
  { country: 'MX', label: 'Mexico_MXN' },
];

(async () => {
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const data: InvoiceData = {
      ...baseData,
      countryCode: tc.country,
      invoiceNumber: `LY-TEST-000${i + 1}`,
    };
    const buf = await generateInvoicePDF(data);
    const filePath = path.join(outDir, `invoice_${tc.label}.pdf`);
    fs.writeFileSync(filePath, buf);
    console.log(`✓ ${filePath}`);
  }
  console.log('\nDone! Check the test_invoices/ folder.');
})();
