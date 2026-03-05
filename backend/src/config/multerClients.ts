import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer para clientes - guarda en carpeta del cliente específico
export const uploadClientFiles = (clientId: string) => {
  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      const clientDir = path.join(__dirname, '../../uploads/clients', clientId);
      const fs = await import('fs/promises');
      await fs.mkdir(clientDir, { recursive: true });
      cb(null, clientDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '_' + file.originalname);
    }
  });

  return multer({ storage });
};
