import { RequestHandler } from 'express';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import {
  startPolling,
  stopPolling,
  isPollingActive,
  processIncomingEmails,
  getEmailConversations,
  getPendingConsultas,
  markConversationRead,
  deleteConversation,
  toggleConversationAutoReply,
  sendManualEmail,
  encryptPassword,
} from '../services/emailProcessorService.js';
import { Automation } from '../models/Automation.js';
import { Subaccount } from '../models/Subaccount.js';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';
import { verifyOwnership, type AuthRequest } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads/automatizaciones');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Helper: get account doc from DB (or return defaults)
async function getAccount(accountId: string) {
  const doc = await Automation.findById(accountId);
  if (doc) return doc;
  // Return a new unsaved document with defaults
  return new Automation({
    _id: accountId,
    accountId,
    especialidades: [],
    cuentasCorreo: [],
    correosConsultas: [],
    documentos: [],
    switchActivo: false,
    subcuentaEspecialidades: {},
    sortByCarga: false,
  });
}

// Helper: save account doc (upsert)
async function saveAccount(accountId: string, data: Record<string, any>) {
  await Automation.findByIdAndUpdate(accountId, { $set: { ...data, accountId } }, { upsert: true, returnDocument: 'after' });
}

// Extract PDF text
async function extractPdfText(pdfPath: string): Promise<string> {
  try {
    const pdfBuffer = await fsPromises.readFile(pdfPath);
    const pdfParseModule: any = await import('pdf-parse');
    const PDFParse = pdfParseModule.PDFParse;
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    return result.text || '';
  } catch { return ''; }
}

// Multer for PDF documents (knowledge base)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${sanitizeFilename(file.originalname)}`),
});
export const uploadMiddleware = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se permiten archivos PDF'));
  },
});

// Multer for email attachments (multiple files, 10MB limit)
const EMAIL_ATTACHMENTS_DIR = path.join(__dirname, '../../uploads/email-attachments');
if (!fs.existsSync(EMAIL_ATTACHMENTS_DIR)) fs.mkdirSync(EMAIL_ATTACHMENTS_DIR, { recursive: true });

const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.scr', '.com', '.pif', '.vbs', '.js', '.wsf', '.hta'];

const emailAttachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, EMAIL_ATTACHMENTS_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${sanitizeFilename(file.originalname)}`),
});
export const emailAttachmentMiddleware = multer({
  storage: emailAttachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      cb(new Error('Tipo de archivo no permitido'));
    } else {
      cb(null, true);
    }
  },
});

// GET all data for account
export const getData: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    res.json(account.toJSON());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET subcuentas (filtered by parentAccountId)
export const getSubcuentas: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  try {
    if (!accountId) {
      const all = await Subaccount.find();
      res.json(all.map(s => s.toJSON()));
      return;
    }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
    const subs = await Subaccount.find({ parentAccountId: accountId });
    res.json(subs.map(s => s.toJSON()));
  } catch { res.json([]); }
};

// POST especialidad
export const createEspecialidad: RequestHandler = async (req, res) => {
  const { accountId, nombre, descripcion } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  if (!nombre) { res.status(400).json({ error: 'nombre requerido' }); return; }
  try {
    const account = await getAccount(accountId);
    const nueva = { id: Date.now().toString(), nombre, descripcion: descripcion || '', createdAt: new Date().toISOString() };
    account.especialidades.push(nueva);
    await saveAccount(accountId, { especialidades: account.especialidades });
    res.json(nueva);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT especialidad
export const updateEspecialidad: RequestHandler = async (req, res) => {
  const { accountId, nombre, descripcion } = req.body;
  const { id } = req.params;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  if (!nombre) { res.status(400).json({ error: 'nombre requerido' }); return; }
  try {
    const account = await getAccount(accountId);
    const idx = account.especialidades.findIndex((e: any) => e.id === id);
    if (idx === -1) { res.status(404).json({ error: 'Especialidad no encontrada' }); return; }
    account.especialidades[idx].nombre = nombre;
    account.especialidades[idx].descripcion = descripcion || '';
    await saveAccount(accountId, { especialidades: account.especialidades });
    res.json(account.especialidades[idx]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE especialidad
export const deleteEspecialidad: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const deletedId = req.params.id;
    account.especialidades = account.especialidades.filter(e => e.id !== deletedId);
    // Limpiar asignaciones huérfanas en subcuentaEspecialidades
    if (account.subcuentaEspecialidades) {
      const updated: Record<string, string> = {};
      for (const [subId, espId] of Object.entries(account.subcuentaEspecialidades)) {
        if (espId !== deletedId) updated[subId] = espId as string;
      }
      account.subcuentaEspecialidades = updated;
    }
    await saveAccount(accountId, { especialidades: account.especialidades, subcuentaEspecialidades: account.subcuentaEspecialidades });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST cuenta correo
export const createCuentaCorreo: RequestHandler = async (req, res) => {
  const { accountId, plataforma, correo, password } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  if (!correo) { res.status(400).json({ error: 'correo requerido' }); return; }
  try {
    const account = await getAccount(accountId);
    const nueva = { id: Date.now().toString(), plataforma: plataforma || 'gmail', correo, password: encryptPassword(password || ''), createdAt: new Date().toISOString() };
    account.cuentasCorreo.push(nueva);
    await saveAccount(accountId, { cuentasCorreo: account.cuentasCorreo });
    // Start polling so emails are always fetched
    startPolling(accountId);
    res.json(nueva);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE cuenta correo
export const deleteCuentaCorreo: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    account.cuentasCorreo = account.cuentasCorreo.filter(c => c.id !== req.params.id);
    await saveAccount(accountId, { cuentasCorreo: account.cuentasCorreo });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST correo consultas
export const createCorreoConsulta: RequestHandler = async (req, res) => {
  const { accountId, email } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  if (!email) { res.status(400).json({ error: 'email requerido' }); return; }
  try {
    const account = await getAccount(accountId);
    if (!account.correosConsultas.includes(email)) account.correosConsultas.push(email);
    await saveAccount(accountId, { correosConsultas: account.correosConsultas });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE correo consultas
export const deleteCorreoConsulta: RequestHandler = async (req, res) => {
  const { accountId, email } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    account.correosConsultas = account.correosConsultas.filter(c => c !== email);
    await saveAccount(accountId, { correosConsultas: account.correosConsultas });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST documento (upload) — now extracts PDF text
export const uploadDocumento: RequestHandler = async (req, res) => {
  const accountId = req.body.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  if (!req.file) { res.status(400).json({ error: 'archivo requerido' }); return; }
  try {
    const account = await getAccount(accountId);
    const filePath = path.join(UPLOADS_DIR, req.file.filename);
    const extractedText = await extractPdfText(filePath);
    const doc = {
      id: Date.now().toString(),
      nombre: sanitizeFilename(req.file.originalname),
      filename: req.file.filename,
      extractedText,
      uploadedAt: new Date().toISOString(),
    };
    account.documentos.push(doc);
    await saveAccount(accountId, { documentos: account.documentos });
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE documento
export const deleteDocumento: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const doc = account.documentos.find(d => d.id === req.params.id);
    if (doc) {
      const filePath = path.join(UPLOADS_DIR, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      account.documentos = account.documentos.filter(d => d.id !== req.params.id);
      await saveAccount(accountId, { documentos: account.documentos });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET documento (view)
export const viewDocumento: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const doc = account.documentos.find(d => d.id === req.params.id);
    if (!doc) { res.status(404).json({ error: 'no encontrado' }); return; }
    const filePath = path.join(UPLOADS_DIR, doc.filename);
    const ext = path.extname(doc.filename).toLowerCase();
    const contentType = ext === '.txt' ? 'text/plain; charset=utf-8' : 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.nombre}"`);
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT switch — starts/stops polling
export const updateSwitch: RequestHandler = async (req, res) => {
  const { accountId, switchActivo } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const newSwitch = switchActivo ?? account.switchActivo;
    await saveAccount(accountId, { switchActivo: newSwitch });

    // Always keep polling active so emails are fetched regardless of switchActivo
    startPolling(accountId);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT sortByCarga
export const updateSortByCarga: RequestHandler = async (req, res) => {
  const { accountId, sortByCarga } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const newSort = sortByCarga ?? account.sortByCarga;
    await saveAccount(accountId, { sortByCarga: newSort });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT autoAssignEnabled
export const updateAutoAssignEnabled: RequestHandler = async (req, res) => {
  const { accountId, autoAssignEnabled } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    await saveAccount(accountId, { autoAssignEnabled: !!autoAssignEnabled });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT email selection settings (respond consultas, solicitudes, only known contacts)
export const updateEmailSelection: RequestHandler = async (req, res) => {
  const { accountId, respondConsultasGenerales, respondSolicitudesServicio, soloContactosConocidos } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const update: Record<string, boolean> = {};
    if (typeof respondConsultasGenerales === 'boolean') update.respondConsultasGenerales = respondConsultasGenerales;
    if (typeof respondSolicitudesServicio === 'boolean') update.respondSolicitudesServicio = respondSolicitudesServicio;
    if (typeof soloContactosConocidos === 'boolean') update.soloContactosConocidos = soloContactosConocidos;
    await saveAccount(accountId, update);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT subcuenta especialidad
export const updateSubcuentaEspecialidad: RequestHandler = async (req, res) => {
  const { accountId, subcuentaId, especialidadId } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const subs = { ...(account.subcuentaEspecialidades || {}) };
    if (especialidadId === '') delete subs[subcuentaId];
    else subs[subcuentaId] = especialidadId;
    await saveAccount(accountId, { subcuentaEspecialidades: subs });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET email conversations
export const getConversations: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  res.json(await getEmailConversations(accountId));
};

// GET pending consultas
export const getPendingConsultasHandler: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  res.json(await getPendingConsultas(accountId));
};

// GET polling status
export const getPollingStatus: RequestHandler = (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  res.json({ active: isPollingActive(accountId) });
};

// POST force check emails now
export const forceCheckEmails: RequestHandler = async (req, res) => {
  const { accountId } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const count = await processIncomingEmails(accountId);
    res.json({ ok: true, processed: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al revisar emails' });
  }
};

// PUT mark conversation as read
export const markRead: RequestHandler = async (req, res) => {
  const { accountId, conversationId } = req.body;
  if (!accountId || !conversationId) { res.status(400).json({ error: 'accountId y conversationId requeridos' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  await markConversationRead(accountId, conversationId);
  res.json({ ok: true });
};

// DELETE conversation
export const deleteConversationHandler: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  const { id } = req.params;
  if (!accountId || !id) { res.status(400).json({ error: 'accountId e id requeridos' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  await deleteConversation(accountId, id);
  res.json({ ok: true });
};

// PUT toggle auto-reply for individual conversation
export const toggleAutoReplyHandler: RequestHandler = async (req, res) => {
  const { accountId, conversationId, paused } = req.body;
  if (!accountId || !conversationId || typeof paused !== 'boolean') {
    res.status(400).json({ error: 'accountId, conversationId y paused (boolean) requeridos' });
    return;
  }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  const ok = await toggleConversationAutoReply(accountId, conversationId, paused);
  if (!ok) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }
  res.json({ ok: true });
};

// POST send manual email in conversation (with optional attachments)
export const sendManualEmailHandler: RequestHandler = async (req, res) => {
  const { accountId, conversationId, text } = req.body;
  if (!accountId || !conversationId) {
    res.status(400).json({ error: 'accountId y conversationId requeridos' });
    return;
  }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  const messageText = text || '';
  const files = (req.files as Express.Multer.File[]) || [];
  if (!messageText.trim() && files.length === 0) {
    res.status(400).json({ error: 'Texto o archivos requeridos' });
    return;
  }
  try {
    const attachmentFiles = files.map(f => ({
      id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 8),
      filename: f.filename,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      path: f.path,
    }));
    const ok = await sendManualEmail(accountId, conversationId, messageText, attachmentFiles.length > 0 ? attachmentFiles : undefined);
    if (!ok) { res.status(404).json({ error: 'Conversación o cuenta de correo no encontrada' }); return; }
    res.json({ ok: true, attachments: attachmentFiles.map(a => ({ id: a.id, filename: a.filename, originalName: a.originalName, mimeType: a.mimeType, size: a.size })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al enviar email' });
  }
};

// GET unread email count
export const getUnreadCount: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const count = (account.emailConversations || []).reduce((a: number, c: any) => a + (c.unread || 0), 0);
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST create email folder
export const createEmailFolder: RequestHandler = async (req, res) => {
  const { accountId, name } = req.body;
  if (!accountId || !name?.trim()) { res.status(400).json({ error: 'accountId y name requeridos' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const folders = account.emailFolders || [];
    const newFolder = { id: Date.now().toString(), name: name.trim(), conversationIds: [] };
    folders.push(newFolder);
    await saveAccount(accountId, { emailFolders: folders });
    res.json({ ok: true, folder: newFolder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE email folder
export const deleteEmailFolder: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  const { id } = req.params;
  if (!accountId || !id) { res.status(400).json({ error: 'accountId e id requeridos' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const folders = (account.emailFolders || []).filter((f: any) => f.id !== id);
    await saveAccount(accountId, { emailFolders: folders });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT assign conversation to folder
export const assignConversationToFolder: RequestHandler = async (req, res) => {
  const { accountId, folderId, conversationId } = req.body;
  if (!accountId || !folderId || !conversationId) { res.status(400).json({ error: 'accountId, folderId y conversationId requeridos' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const folders = (account.emailFolders || []).map((f: any) => ({
      ...f,
      conversationIds: (f.conversationIds || []).filter((cid: string) => cid !== conversationId),
    }));
    const target = folders.find((f: any) => f.id === folderId);
    if (!target) { res.status(404).json({ error: 'Carpeta no encontrada' }); return; }
    target.conversationIds.push(conversationId);
    await saveAccount(accountId, { emailFolders: folders });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT remove conversation from folder
export const removeConversationFromFolder: RequestHandler = async (req, res) => {
  const { accountId, folderId, conversationId } = req.body;
  if (!accountId || !folderId || !conversationId) { res.status(400).json({ error: 'accountId, folderId y conversationId requeridos' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const folders = (account.emailFolders || []).map((f: any) =>
      f.id === folderId ? { ...f, conversationIds: (f.conversationIds || []).filter((cid: string) => cid !== conversationId) } : f
    );
    await saveAccount(accountId, { emailFolders: folders });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET download email attachment
export const downloadEmailAttachment: RequestHandler = async (req, res) => {
  const { filename } = req.params;
  if (!filename) { res.status(400).json({ error: 'filename requerido' }); return; }
  const sanitized = path.basename(filename);
  const filePath = path.join(EMAIL_ATTACHMENTS_DIR, sanitized);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Archivo no encontrado' }); return; }
  res.download(filePath, sanitized);
};

// GET classify rules
export const getClassifyRules: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    res.json({ rules: account.emailClassifyRules || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST create classify rule
export const createClassifyRule: RequestHandler = async (req, res) => {
  const { accountId, name, description, folderIds } = req.body;
  if (!accountId || !name?.trim() || !description?.trim() || !Array.isArray(folderIds) || folderIds.length === 0) {
    res.status(400).json({ error: 'accountId, name, description y folderIds requeridos' }); return;
  }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const rules = account.emailClassifyRules || [];
    const newRule = { id: Date.now().toString(), name: name.trim(), description: description.trim(), folderIds, createdAt: new Date().toISOString() };
    rules.push(newRule);
    await saveAccount(accountId, { emailClassifyRules: rules });
    res.json({ ok: true, rule: newRule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE classify rule
export const deleteClassifyRule: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  const { id } = req.params;
  if (!accountId || !id) { res.status(400).json({ error: 'accountId e id requeridos' }); return; }
  if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const account = await getAccount(accountId);
    const rules = (account.emailClassifyRules || []).filter((r: any) => r.id !== id);
    await saveAccount(accountId, { emailClassifyRules: rules });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
