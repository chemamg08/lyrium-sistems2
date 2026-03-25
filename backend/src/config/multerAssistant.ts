import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const fsModule = await import('fs/promises');
    const dir = path.join(__dirname, '../../uploads/assistant_files');
    await fsModule.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const suffix = Date.now() + '_' + Math.round(Math.random() * 1e9);
    cb(null, suffix + '_' + sanitizeFilename(file.originalname));
  }
});

export const uploadAssistantFileMw = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain', 'text/csv'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF o TXT'));
    }
  },
  limits: { fileSize: 30 * 1024 * 1024 } // 30 MB
});
