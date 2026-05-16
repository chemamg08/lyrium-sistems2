import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TAX_RATES_DIRS = [
  path.resolve(__dirname, '../config/taxRates'),
  path.resolve(__dirname, '../../src/config/taxRates'),
  path.resolve(process.cwd(), 'src/config/taxRates'),
  path.resolve(process.cwd(), 'dist/config/taxRates'),
];

export function resolveTaxRatesFile(countryCode: string): string | null {
  const normalizedCode = (countryCode || '').trim().toLowerCase().slice(0, 2);
  if (!normalizedCode) return null;

  for (const dir of TAX_RATES_DIRS) {
    const filePath = path.join(dir, `${normalizedCode}.json`);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}
