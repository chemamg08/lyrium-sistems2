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
} from '../services/emailProcessorService.js';
import { Automation } from '../models/Automation.js';
import { Subaccount } from '../models/Subaccount.js';

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

// Multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
export const uploadMiddleware = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se permiten archivos PDF'));
  },
});

// GET all data for account
export const getData: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
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
    const subs = await Subaccount.find({ parentAccountId: accountId });
    res.json(subs.map(s => s.toJSON()));
  } catch { res.json([]); }
};

// POST especialidad
export const createEspecialidad: RequestHandler = async (req, res) => {
  const { accountId, nombre, descripcion } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
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
  try {
    const account = await getAccount(accountId);
    account.especialidades = account.especialidades.filter(e => e.id !== req.params.id);
    await saveAccount(accountId, { especialidades: account.especialidades });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// POST cuenta correo
export const createCuentaCorreo: RequestHandler = async (req, res) => {
  const { accountId, plataforma, correo, password } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  if (!correo) { res.status(400).json({ error: 'correo requerido' }); return; }
  try {
    const account = await getAccount(accountId);
    const nueva = { id: Date.now().toString(), plataforma: plataforma || 'gmail', correo, password: password || '', createdAt: new Date().toISOString() };
    account.cuentasCorreo.push(nueva);
    await saveAccount(accountId, { cuentasCorreo: account.cuentasCorreo });
    res.json(nueva);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE cuenta correo
export const deleteCuentaCorreo: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
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
  if (!req.file) { res.status(400).json({ error: 'archivo requerido' }); return; }
  try {
    const account = await getAccount(accountId);
    const filePath = path.join(UPLOADS_DIR, req.file.filename);
    const extractedText = await extractPdfText(filePath);
    const doc = {
      id: Date.now().toString(),
      nombre: req.file.originalname,
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
  try {
    const account = await getAccount(accountId);
    const newSwitch = switchActivo ?? account.switchActivo;
    await saveAccount(accountId, { switchActivo: newSwitch });

    // Start or stop polling based on switch
    if (newSwitch) startPolling(accountId);
    else stopPolling(accountId);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT sortByCarga
export const updateSortByCarga: RequestHandler = async (req, res) => {
  const { accountId, sortByCarga } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
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
  try {
    await saveAccount(accountId, { autoAssignEnabled: !!autoAssignEnabled });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// PUT subcuenta especialidad
export const updateSubcuentaEspecialidad: RequestHandler = async (req, res) => {
  const { accountId, subcuentaId, especialidadId } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
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
  res.json(await getEmailConversations(accountId));
};

// GET pending consultas
export const getPendingConsultasHandler: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  res.json(await getPendingConsultas(accountId));
};

// GET polling status
export const getPollingStatus: RequestHandler = (req, res) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
  res.json({ active: isPollingActive(accountId) });
};

// POST force check emails now
export const forceCheckEmails: RequestHandler = async (req, res) => {
  const { accountId } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId requerido' }); return; }
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
  await markConversationRead(accountId, conversationId);
  res.json({ ok: true });
};

// DELETE conversation
export const deleteConversationHandler: RequestHandler = async (req, res) => {
  const accountId = req.query.accountId as string;
  const { id } = req.params;
  if (!accountId || !id) { res.status(400).json({ error: 'accountId e id requeridos' }); return; }
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
  const ok = await toggleConversationAutoReply(accountId, conversationId, paused);
  if (!ok) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }
  res.json({ ok: true });
};

// POST send manual email in conversation
export const sendManualEmailHandler: RequestHandler = async (req, res) => {
  const { accountId, conversationId, text } = req.body;
  if (!accountId || !conversationId || !text) {
    res.status(400).json({ error: 'accountId, conversationId y text requeridos' });
    return;
  }
  try {
    const ok = await sendManualEmail(accountId, conversationId, text);
    if (!ok) { res.status(404).json({ error: 'Conversación o cuenta de correo no encontrada' }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al enviar email' });
  }
};
