import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getAccountLogoDir = (accountId: string) => path.join(__dirname, '../../uploads/logos', accountId);

export const getAccountLogoPath = (accountId: string) => path.join(getAccountLogoDir(accountId), 'logo.png');

export const ensureAccountLogoDir = async (accountId: string) => {
  await fs.mkdir(getAccountLogoDir(accountId), { recursive: true });
};
