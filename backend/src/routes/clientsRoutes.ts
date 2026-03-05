import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getClients,
  createClient,
  updateClient,
  deleteClient,
  updateClientStatus,
  getClientFile,
  uploadClientFile,
  deleteClientFile
} from '../controllers/clientsController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración multer para nuevos clientes (sin carpeta específica aún)
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const fs = await import('fs/promises');
    const tempDir = path.join(__dirname, '../../uploads/clients/temp');
    await fs.mkdir(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '_' + file.originalname);
  }
});

const uploadMultiple = multer({ storage });

// Configuración para archivos de cliente existente
const storageExisting = multer.diskStorage({
  destination: async (req, file, cb) => {
    const fs = await import('fs/promises');
    const clientId = req.params.clientId;
    const clientDir = path.join(__dirname, '../../uploads/clients', clientId);
    await fs.mkdir(clientDir, { recursive: true });
    cb(null, clientDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '_' + file.originalname);
  }
});

const uploadSingle = multer({ storage: storageExisting });

const router = Router();

router.get('/clients', getClients);
router.post('/clients', uploadMultiple.array('files'), createClient);
router.put('/clients/:id', uploadMultiple.array('files'), updateClient);
router.delete('/clients/:id', deleteClient);
router.patch('/clients/:id/status', updateClientStatus);
router.get('/clients/:clientId/files/:fileId', getClientFile);
router.post('/clients/:clientId/files', uploadSingle.single('file'), uploadClientFile);
router.delete('/clients/:clientId/files/:fileId', deleteClientFile);

export default router;
