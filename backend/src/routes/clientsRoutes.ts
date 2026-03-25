import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';
import {
  getClients,
  createClient,
  updateClient,
  deleteClient,
  updateClientStatus,
  updateClientNotes,
  getClientFile,
  uploadClientFile,
  deleteClientFile,
  addTimerEntry,
  deleteTimerEntry,
  getInvoiceSettings,
  updateInvoiceSettings,
  getClientInvoices,
  createInvoice,
  deleteInvoice,
  updateInvoice,
  sendInvoiceEmail,
  getEmailAccounts,
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
    cb(null, uniqueSuffix + '_' + sanitizeFilename(file.originalname));
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
    cb(null, uniqueSuffix + '_' + sanitizeFilename(file.originalname));
  }
});

const uploadSingle = multer({ storage: storageExisting, limits: { fileSize: 100 * 1024 * 1024 } });

const router = Router();

router.get('/clients', getClients);
router.post('/clients', uploadMultiple.array('files'), createClient);
router.put('/clients/:id', uploadMultiple.array('files'), updateClient);
router.delete('/clients/:id', deleteClient);
router.patch('/clients/:id/status', updateClientStatus);
router.patch('/clients/:id/notes', updateClientNotes);
router.get('/clients/:clientId/files/:fileId', getClientFile);
router.post('/clients/:clientId/files', (req: Request, res: Response, next: NextFunction) => {
  uploadSingle.single('file')(req, res, (err: any) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'FILE_TOO_LARGE' });
    }
    if (err) return res.status(500).json({ error: 'Error uploading file' });
    next();
  });
}, uploadClientFile);
router.delete('/clients/:clientId/files/:fileId', deleteClientFile);

// Timer entries
router.post('/clients/:id/timer-entries', addTimerEntry);
router.delete('/clients/:id/timer-entries/:entryId', deleteTimerEntry);

// Invoice settings
router.get('/invoice-settings', getInvoiceSettings);
router.put('/invoice-settings', updateInvoiceSettings);

// Invoices
router.get('/clients/:id/invoices', getClientInvoices);
router.post('/clients/:id/invoices', createInvoice);
router.put('/invoices/:invoiceId', updateInvoice);
router.delete('/invoices/:invoiceId', deleteInvoice);
router.post('/invoices/:invoiceId/send', sendInvoiceEmail);

// Email accounts (for invoice sending)
router.get('/email-accounts', getEmailAccounts);

export default router;
