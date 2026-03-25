import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer para contratos temporales
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const fs = await import('fs/promises');
    const uploadDir = path.join(__dirname, '../../uploads/temp_contracts');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '_' + sanitizeFilename(file.originalname));
  }
});

export const uploadTempContract = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'));
    }
  },
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});
