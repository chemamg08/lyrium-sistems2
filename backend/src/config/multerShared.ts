import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fsSync from 'fs';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '../../uploads/shared');
if (!fsSync.existsSync(uploadDir)) {
  fsSync.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '_' + Math.round(Math.random() * 1e9);
    cb(null, unique + '_' + sanitizeFilename(file.originalname));
  },
});

export const uploadShared = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });
