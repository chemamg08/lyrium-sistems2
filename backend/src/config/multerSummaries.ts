import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/summaries'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '_' + sanitizeFilename(file.originalname));
  }
});

// Filtro para aceptar solo PDFs
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PDF'), false);
  }
};

export const uploadSummaries = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});
