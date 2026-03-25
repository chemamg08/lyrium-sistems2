import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';
import {
  sendForSignature,
  getSignaturesForChat,
  getSignaturesForClient,
  resendSignature,
  downloadSignedPdf,
  uploadAndSign,
} from '../controllers/signatureController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const signUploadStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const fs = await import('fs/promises');
    const dir = path.join(__dirname, '../../uploads/signatures');
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '_' + sanitizeFilename(file.originalname));
  }
});
const signUpload = multer({ storage: signUploadStorage, limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// All routes below require auth (applied via parent router)
router.post('/', sendForSignature);
router.post('/upload-sign', signUpload.single('file'), uploadAndSign);
router.get('/chat/:chatId', getSignaturesForChat);
router.get('/client/:clientId', getSignaturesForClient);
router.post('/:id/resend', resendSignature);
router.get('/:id/download-signed', downloadSignedPdf);

export default router;
