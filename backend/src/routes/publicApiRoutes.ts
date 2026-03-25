import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';
import { apiKeyAuth, ApiKeyRequest } from '../middleware/apiKeyAuth.js';
import { Client } from '../models/Client.js';
import { SignatureRequest } from '../models/SignatureRequest.js';
import { createSignatureRequestFromUpload } from '../services/signatureService.js';
import { dispatchWebhook } from '../services/webhookService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// All routes require API key auth
router.use(apiKeyAuth as any);

// Multer for file uploads via API
const apiUploadStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const fs = await import('fs/promises');
    const clientId = req.params.clientId;
    const dir = path.join(__dirname, '../../uploads/clients', clientId);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '_' + sanitizeFilename(file.originalname));
  }
});
const apiUpload = multer({ storage: apiUploadStorage, limits: { fileSize: 100 * 1024 * 1024 } });

// GET /api/v1/clients — List clients
router.get('/clients', async (req: ApiKeyRequest, res: Response) => {
  try {
    const accountId = req.apiKeyAccountId!;
    const clients = await Client.find({ accountId }).sort({ _id: -1 });
    res.json(clients.map(c => c.toJSON()));
  } catch (error) {
    console.error('Public API - list clients error:', error);
    res.status(500).json({ error: 'Error listing clients' });
  }
});

// POST /api/v1/clients — Create client
router.post('/clients', async (req: ApiKeyRequest, res: Response) => {
  try {
    const accountId = req.apiKeyAccountId!;
    const { name, email, phone, clientType, notes } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    const client = await Client.create({
      _id: Date.now().toString(),
      name,
      email: email || '',
      phone: phone || '',
      cases: 0,
      status: 'abierto',
      summary: '',
      files: [],
      accountId,
      clientType: clientType || 'particular',
      notes: notes || '',
    });

    dispatchWebhook(accountId, 'new_client', { clientId: client._id, name: client.name, email: client.email }).catch(() => {});

    res.status(201).json(client.toJSON());
  } catch (error) {
    console.error('Public API - create client error:', error);
    res.status(500).json({ error: 'Error creating client' });
  }
});

// POST /api/v1/clients/:clientId/notes — Add note to client
router.post('/clients/:clientId/notes', async (req: ApiKeyRequest, res: Response) => {
  try {
    const accountId = req.apiKeyAccountId!;
    const { clientId } = req.params;
    const { notes } = req.body;

    if (typeof notes !== 'string') return res.status(400).json({ error: 'notes must be a string' });

    const client = await Client.findOne({ _id: clientId, accountId });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    client.notes = notes;
    await client.save();

    res.json(client.toJSON());
  } catch (error) {
    console.error('Public API - add note error:', error);
    res.status(500).json({ error: 'Error updating notes' });
  }
});

// GET /api/v1/clients/:clientId/files — List client files
router.get('/clients/:clientId/files', async (req: ApiKeyRequest, res: Response) => {
  try {
    const accountId = req.apiKeyAccountId!;
    const { clientId } = req.params;

    const client = await Client.findOne({ _id: clientId, accountId });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    res.json(client.files || []);
  } catch (error) {
    console.error('Public API - list files error:', error);
    res.status(500).json({ error: 'Error listing files' });
  }
});

// POST /api/v1/clients/:clientId/files — Upload file to client
router.post('/clients/:clientId/files', apiUpload.single('file'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const accountId = req.apiKeyAccountId!;
    const { clientId } = req.params;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'file is required' });

    const client = await Client.findOne({ _id: clientId, accountId });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const newFile = {
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      name: sanitizeFilename(file.originalname),
      date: new Date().toISOString().split('T')[0],
      filePath: file.path,
      fileSize: file.size,
    };

    client.files.push(newFile as any);
    await client.save();

    res.status(201).json(newFile);
  } catch (error) {
    console.error('Public API - upload file error:', error);
    res.status(500).json({ error: 'Error uploading file' });
  }
});

// POST /api/v1/signatures — Send signature request
router.post('/signatures', async (req: ApiKeyRequest, res: Response) => {
  try {
    const accountId = req.apiKeyAccountId!;
    const { clientId, fileName, description } = req.body;

    if (!clientId || !fileName) {
      return res.status(400).json({ error: 'clientId and fileName are required' });
    }

    const client = await Client.findOne({ _id: clientId, accountId });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.email) return res.status(400).json({ error: 'Client has no email address' });

    // Find the file in client's files
    const fileEntry = client.files.find((f: any) => f.name === fileName || f.id === fileName);
    if (!fileEntry) return res.status(404).json({ error: 'File not found in client files' });

    const result = await createSignatureRequestFromUpload({
      clientId,
      accountId,
      signerEmail: client.email,
      signerName: client.name,
      originalFilePath: (fileEntry as any).filePath,
      fileName: (fileEntry as any).name,
      description,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Public API - send signature error:', error);
    res.status(500).json({ error: error.message || 'Error sending signature request' });
  }
});

// GET /api/v1/signatures/:id/status — Get signature status
router.get('/signatures/:id/status', async (req: ApiKeyRequest, res: Response) => {
  try {
    const accountId = req.apiKeyAccountId!;
    const { id } = req.params;

    const sigReq = await SignatureRequest.findOne({ _id: id, accountId });
    if (!sigReq) return res.status(404).json({ error: 'Signature request not found' });

    // Check if expired
    if (new Date(sigReq.expiresAt) < new Date() && sigReq.status !== 'signed') {
      sigReq.status = 'expired';
      await sigReq.save();
      dispatchWebhook(accountId, 'signature_expired', { signatureRequestId: sigReq._id, clientId: sigReq.clientId, signerEmail: sigReq.signerEmail }).catch(() => {});
    }

    res.json({
      id: sigReq._id,
      status: sigReq.status,
      signerEmail: sigReq.signerEmail,
      signerName: sigReq.signerName,
      sentAt: sigReq.sentAt,
      openedAt: sigReq.openedAt,
      signedAt: sigReq.signedAt,
      expiresAt: sigReq.expiresAt,
    });
  } catch (error) {
    console.error('Public API - signature status error:', error);
    res.status(500).json({ error: 'Error getting signature status' });
  }
});

export default router;
