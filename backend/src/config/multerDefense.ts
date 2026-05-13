import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    const fsModule = await import('fs/promises');
    const user = (req as any).user;
    const userId = user?.userId || 'unknown';
    const dir = path.join(__dirname, '../../uploads/evidence', userId);
    await fsModule.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const suffix = Date.now() + '_' + Math.round(Math.random() * 1e9);
    cb(null, suffix + '_' + sanitizeFilename(file.originalname));
  }
});

export const uploadDefenseEvidence = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido para evidencias'));
    }
  },
  // Sin límite de tamaño por archivo individual; la cuota se controla por usuario
});
