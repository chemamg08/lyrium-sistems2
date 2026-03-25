import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '_' + sanitizeFilename(file.originalname));
  }
});

export const upload = multer({ storage });
