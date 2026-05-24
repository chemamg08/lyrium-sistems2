import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { AI_AUTOMATION_MODEL } from '../config/aiModel.js';
import { stripThinkTags } from './aiService.js';
import {
  fetchUnreadEmails,
  markEmailsAsSeen,
  sendEmailViaCuenta,
  replyToEmail,
  type CuentaCorreoConfig,
  type IncomingEmail,
  type IncomingEmailAttachment,
} from './emailService.js';
import { Automation } from '../models/Automation.js';
import { Account } from '../models/Account.js';
import { Client } from '../models/Client.js';
import { Subaccount } from '../models/Subaccount.js';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';
import { buildAssignedSubaccountFields, hasAssignedSubaccount, readAssignedSubaccountIds } from '../utils/clientAssignments.js';
import { getAutomationMessage, resolveAutomationLanguage } from './automationMessages.js';
import { createCaseFromEmail } from './casesService.js';
import {
  findAssignableCandidate,
  listAssignableCandidates,
  selectBestAssignableCandidate,
  type AutomationAssignableCandidate,
} from './automationWorkspaceService.js';
import { runCustomerAutomationEngine, type AutomationEngineMessage } from './customerAutomationEngine.js';
import { runWithDistributedLock } from './distributedLockService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function normalizeEmailAddress(email: string): string {
  return (email || '').trim().toLowerCase();
}

function createAutomationClientId(): string {
  return `client_${crypto.randomUUID()}`;
}

interface FindOrCreateClientResult {
  client: any;
  created: boolean;
}

interface ResolvedAssignmentCandidate extends AutomationAssignableCandidate {
  record: any;
}

async function findOrCreateClient(
  accountId: string,
  email?: string,
  phone?: string,
  name?: string,
  preferredId?: string,
): Promise<FindOrCreateClientResult> {
  const normalizedPhone = phone ? normalizePhone(phone) : null;

  let existingClient = null;

  if (email) {
    existingClient = await Client.findOne({
      accountId,
      email: { $regex: new RegExp(`^${email}$`, 'i') },
    });
  }

  if (!existingClient && normalizedPhone) {
    existingClient = await Client.findOne({
      accountId,
      phone: { $regex: new RegExp(`^${normalizedPhone}$`, 'i') },
    });
  }

  if (existingClient) {
    await Client.findByIdAndUpdate(existingClient._id, {
      $inc: { cases: 1 },
    });
    return { client: existingClient, created: false };
  }

  const newClient = await Client.create({
    _id: preferredId || createAutomationClientId(),
    accountId,
    name: name || email || phone || 'Desconocido',
    email: email || '',
    phone: phone || '',
    status: 'abierto',
    cases: 1,
    autoCreated: true,
  });

  return { client: newClient, created: true };
}

async function addSubaccountToClient(clientId: string, subaccountId: string): Promise<void> {
  const client = await Client.findById(clientId);
  if (!client) {
    return;
  }

  const fields = buildAssignedSubaccountFields(readAssignedSubaccountIds(client), subaccountId);
  await Client.findByIdAndUpdate(clientId, fields);
}

async function resolveAssignmentCandidateRecord(
  workspaceId: string,
  candidateId: string,
): Promise<ResolvedAssignmentCandidate | null> {
  const candidate = await findAssignableCandidate(workspaceId, candidateId);
  if (!candidate) return null;

  let record: any = null;
  if (candidate.kind === 'main') {
    record = await Account.findById(candidateId).lean();
  } else {
    record = await Subaccount.findById(candidateId).lean();
  }

  if (!record) return null;
  return { ...candidate, record };
}

async function listAssignmentCandidatesWithRecords(workspaceId: string): Promise<ResolvedAssignmentCandidate[]> {
  const candidates = await listAssignableCandidates(workspaceId);
  const resolved = await Promise.all(candidates.map((candidate) => resolveAssignmentCandidateRecord(workspaceId, candidate.id)));
  return resolved.filter((candidate): candidate is ResolvedAssignmentCandidate => !!candidate);
}

const UPLOADS_DIR = path.join(__dirname, '../../uploads/automatizaciones');
const EMAIL_ATTACHMENTS_DIR = path.join(__dirname, '../../uploads/email-attachments');
const META_API_VERSION = process.env.WHATSAPP_META_API_VERSION || 'v22.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Ensure directories exist
if (!fs.existsSync(EMAIL_ATTACHMENTS_DIR)) fs.mkdirSync(EMAIL_ATTACHMENTS_DIR, { recursive: true });

// â”€â”€ Encryption for email passwords (AES-256-GCM) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _encryptionKey: Buffer | null = null;
function getEncryptionKey(): Buffer {
  if (!_encryptionKey) {
    _encryptionKey = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'lyrium-fallback-key').digest();
  }
  return _encryptionKey;
}

export function encryptPassword(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptPassword(ciphertext: string): string {
  // Support plain-text passwords (not yet encrypted)
  if (!ciphertext.includes(':')) return ciphertext;
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch (err) {
    console.error('[decryptPassword] Failed to decrypt â€” JWT_SECRET may differ from when password was encrypted');
    return '';
  }
}

// â”€â”€ AI clients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _qwen: OpenAI | null = null;
function getQwen(): OpenAI {
  if (!_qwen) {
    _qwen = new OpenAI({
      apiKey: process.env.ATLAS_API_KEY,
      baseURL: 'https://api.atlascloud.ai/v1',
    });
  }
  return _qwen;
}

// â”€â”€ Interfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Especialidad { id: string; nombre: string; descripcion: string; createdAt: string; }
interface CuentaCorreo {
  id: string;
  plataforma: string;
  correo: string;
  password: string;
  createdAt: string;
  customSmtpHost?: string;
  customSmtpPort?: number;
  customImapHost?: string;
  customImapPort?: number;
}
interface Documento { id: string; nombre: string; filename: string; extractedText?: string; uploadedAt: string; }

interface EmailConversation {
  id: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  messages: Array<{
    id: string;
    from: string;
    text: string;
    time: string;
    sent: boolean;
    messageId?: string;
    references?: string;
    inReplyTo?: string;
  }>;
  lastMessageTime: string;
  unread: number;
  cuentaCorreoId?: string;
  cuentaCorreoEmail?: string;
  autoClientId?: string;
  autoReplyPaused?: boolean;
  classificationType?: 'consulta_general' | 'solicitud_servicio' | 'otro';
}

interface PendingConsulta {
  id: string;
  originalFrom: string;
  originalFromName: string;
  originalSubject: string;
  originalBody: string;
  cuentaCorreoId: string;
  conversationId: string;
  forwardedAt: string;
  type: 'consulta_general' | 'solicitud_sin_especialista' | 'confirmacion_asignacion';
  especialidadId?: string;
  channel?: 'email' | 'whatsapp';
  waContactPhone?: string;
  waConversationId?: string;
}

interface AccountData {
  especialidades: Especialidad[];
  cuentasCorreo: CuentaCorreo[];
  correosConsultas: string[];
  documentos: Documento[];
  switchActivo: boolean;
  subcuentaEspecialidades: Record<string, string>;
  sortByCarga: boolean;
  emailConversations: EmailConversation[];
  pendingConsultas: PendingConsulta[];
}

function toCuentaConfig(cuentaCorreo: CuentaCorreo): CuentaCorreoConfig {
  return {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: decryptPassword(cuentaCorreo.password),
    customSmtpHost: cuentaCorreo.customSmtpHost,
    customSmtpPort: cuentaCorreo.customSmtpPort,
    customImapHost: cuentaCorreo.customImapHost,
    customImapPort: cuentaCorreo.customImapPort,
  };
}

function findCuentaCorreoExact(account: any, cuentaCorreoId?: string): CuentaCorreo | null {
  if (!cuentaCorreoId) return null;
  return (account?.cuentasCorreo || []).find((c: any) => c.id === cuentaCorreoId) || null;
}

function getDefaultCuentaCorreo(account: any): CuentaCorreo | null {
  return (account?.cuentasCorreo || [])[0] || null;
}

function findCuentaCorreo(account: any, cuentaCorreoId?: string): CuentaCorreo | null {
  return findCuentaCorreoExact(account, cuentaCorreoId) || getDefaultCuentaCorreo(account);
}

function getConversationCuentaCorreo(account: any, conversationId?: string): CuentaCorreo | null {
  if (conversationId) {
    const conv = (account?.emailConversations || []).find((c: any) => c.id === conversationId);
    const conversationCuenta = findCuentaCorreoExact(account, conv?.cuentaCorreoId);
    if (conversationCuenta) return conversationCuenta;
  }
  return null;
}

function rememberConversationCuentaCorreo(conversation: any, cuentaCorreo: CuentaCorreo): void {
  conversation.cuentaCorreoId = cuentaCorreo.id;
  conversation.cuentaCorreoEmail = cuentaCorreo.correo;
}

function findEmailConversation(account: any, contactEmail: string, cuentaCorreoId?: string): any | null {
  const matches = (account?.emailConversations || []).filter(
    (conversation: any) => normalizeEmailAddress(conversation.contactEmail) === normalizeEmailAddress(contactEmail)
  );

  if (!cuentaCorreoId) {
    return matches[0] || null;
  }

  return matches.find((conversation: any) => conversation.cuentaCorreoId === cuentaCorreoId)
    || (matches.length === 1 && !matches[0]?.cuentaCorreoId ? matches[0] : null);
}

function extractConsultaPendingId(subject: string): string | null {
  return subject.match(/\[CP-(\d+)\]/)?.[1] || null;
}

function normalizeConsultaSubject(subject: string): string {
  return (subject || '')
    .replace(/^\s*(re|rv|fw|fwd)\s*:\s*/gi, '')
    .replace(/\[Consulta pendiente\]\s*/gi, '')
    .replace(/\[CP-\d+\]\s*/gi, '')
    .trim()
    .toLowerCase();
}

function isConsultaMailbox(account: any, sender: string): boolean {
  const normalizedSender = normalizeEmailAddress(sender);
  return getUnifiedConsultaEmails(account).some((email: string) => normalizeEmailAddress(email) === normalizedSender);
}

function getUnifiedConsultaEmails(account: any): string[] {
  const merged = [
    ...(Array.isArray(account?.correosConsultas) ? account.correosConsultas : []),
    ...(Array.isArray(account?.whatsappCorreosConsultas) ? account.whatsappCorreosConsultas : []),
  ]
    .map((email: any) => normalizeEmailAddress(String(email || '')))
    .filter(Boolean);
  return Array.from(new Set(merged)).slice(0, 1);
}

function isLikelyCommercialEmail(email: IncomingEmail): boolean {
  const from = normalizeEmailAddress(email.from || '');
  const subject = String(email.subject || '').toLowerCase();
  const body = String(email.body || '').toLowerCase();
  const senderName = String(email.fromName || '').toLowerCase();

  const senderHints = [
    'no-reply', 'noreply', 'newsletter', 'marketing', 'mailer', 'notification',
    'notifications', 'promo', 'promotions', 'campaign', 'news@', 'offers', 'ofertas',
  ];
  const subjectHints = [
    'newsletter', 'unsubscribe', 'suscr', 'promociÃ³n', 'promocion', 'oferta',
    'descuento', 'black friday', 'sale', 'rebaja', 'Ãºltimas plazas', 'ultimas plazas',
    'webinar', 'evento gratuito', 'free trial', 'trial', 'campaÃ±a', 'campana',
  ];
  const bodyHints = [
    'list-unsubscribe', 'unsubscribe', 'darse de baja', 'cancelar suscripciÃ³n',
    'cancelar suscripcion', 'view in browser', 'open in browser', 'manage preferences',
    'preferencias de comunicaciÃ³n', 'preferencias de comunicacion', 'this email was sent to',
    'ha recibido este correo porque', 'email marketing', 'promotional email',
  ];

  const senderMatch = senderHints.some((hint) => from.includes(hint) || senderName.includes(hint));
  const subjectMatch = subjectHints.some((hint) => subject.includes(hint));
  const bodyMatch = bodyHints.some((hint) => body.includes(hint));

  return senderMatch || (subjectMatch && bodyMatch);
}

function findPendingConsultaIndex(account: any, reply: IncomingEmail, incomingCuentaCorreo?: CuentaCorreo): number {
  const pendingId = extractConsultaPendingId(reply.subject);
  if (pendingId) {
    return (account.pendingConsultas || []).findIndex((pending: any) => pending.id === pendingId);
  }

  const fromLower = normalizeEmailAddress(reply.from);
  if (!isConsultaMailbox(account, reply.from) && incomingCuentaCorreo?.id) {
    const conversation = findEmailConversation(account, reply.from, incomingCuentaCorreo.id);
    if (conversation) {
      const confirmationIdx = (account.pendingConsultas || []).findIndex((pending: any) =>
        pending.type === 'confirmacion_asignacion'
        && pending.channel !== 'whatsapp'
        && pending.cuentaCorreoId === incomingCuentaCorreo.id
        && pending.conversationId === conversation.id
        && normalizeEmailAddress(pending.originalFrom) === fromLower
      );
      if (confirmationIdx !== -1) return confirmationIdx;
    }
  }

  const normalizedSubject = normalizeConsultaSubject(reply.subject);
  if (!normalizedSubject) return -1;

  const candidates = (account.pendingConsultas || [])
    .map((pending: any, index: number) => ({ pending, index }))
    .filter(({ pending }: any) => {
      if (pending.channel === 'whatsapp' && pending.type === 'confirmacion_asignacion') return false;
      if (incomingCuentaCorreo?.id && pending.channel !== 'whatsapp' && pending.cuentaCorreoId !== incomingCuentaCorreo.id) return false;
      return normalizeConsultaSubject(pending.originalSubject) === normalizedSubject;
    });

  return candidates.length === 1 ? candidates[0].index : -1;
}

function resolvePendingWhatsAppSession(account: any, waConversationId?: string, waContactPhone?: string): any | null {
  const matchingConversation = (account?.whatsappConversations || []).find((conversation: any) =>
    (waConversationId && conversation.id === waConversationId)
    || (waContactPhone && sanitizePhoneForWA(conversation.contactPhone) === sanitizePhoneForWA(waContactPhone))
  );

  const phoneNumberId = matchingConversation?.phoneNumberId || '';
  if (phoneNumberId) {
    const exactSession = (account?.whatsappSessions || []).find((session: any) => session.phoneNumberId === phoneNumberId);
    if (exactSession) return exactSession;
    if (account?.whatsappSession?.phoneNumberId === phoneNumberId) return account.whatsappSession;
  }

  return account?.whatsappSessions?.find((session: any) => session.connected) || account?.whatsappSession || null;
}

// â”€â”€ Data helpers (Mongoose) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function getAccount(accountId: string): Promise<any> {
  let doc = await Automation.findById(accountId);
  if (!doc) {
    doc = await Automation.create({
      _id: accountId,
      accountId,
      especialidades: [],
      cuentasCorreo: [],
      correosConsultas: [],
      documentos: [],
      switchActivo: false,
      subcuentaEspecialidades: {},
      sortByCarga: false,
      emailConversations: [],
      pendingConsultas: [],
    });
  }
  if (!doc.emailConversations) (doc as any).emailConversations = [];
  if (!doc.pendingConsultas) (doc as any).pendingConsultas = [];
  if (!doc.emailFolders) (doc as any).emailFolders = [];
  if (!doc.pendingReplies) (doc as any).pendingReplies = [];
  return doc;
}

async function saveAccount(account: any): Promise<void> {
  // Convert to plain objects to avoid Mongoose serialization issues with mixed subdocuments
  const plain = typeof account.toObject === 'function' ? account.toObject() : account;
  // NOTE: pendingReplies is intentionally excluded â€” managed via atomic $push/$pull/$inc
  await Automation.findByIdAndUpdate(account._id, {
    $set: {
      accountId: plain.accountId,
      especialidades: plain.especialidades,
      cuentasCorreo: plain.cuentasCorreo,
      correosConsultas: plain.correosConsultas,
      documentos: plain.documentos,
      switchActivo: plain.switchActivo,
      subcuentaEspecialidades: plain.subcuentaEspecialidades,
      sortByCarga: plain.sortByCarga,
      autoAssignEnabled: plain.autoAssignEnabled ?? false,
      emailConversations: plain.emailConversations,
      pendingConsultas: plain.pendingConsultas,
      emailFolders: plain.emailFolders ?? [],
      whatsappSession: plain.whatsappSession ?? null,
      whatsappSwitchActivo: plain.whatsappSwitchActivo ?? false,
      whatsappConversations: plain.whatsappConversations ?? [],
      whatsappFolders: plain.whatsappFolders ?? [],
      whatsappCorreosConsultas: plain.whatsappCorreosConsultas ?? [],
      whatsappClassifyRules: plain.whatsappClassifyRules ?? [],
      whatsappRespondConsultasGenerales: plain.whatsappRespondConsultasGenerales ?? true,
      whatsappRespondSolicitudesServicio: plain.whatsappRespondSolicitudesServicio ?? true,
      whatsappSoloContactosConocidos: plain.whatsappSoloContactosConocidos ?? false,
      whatsappOAuthState: plain.whatsappOAuthState ?? null,
      whatsappOAuthStateExpires: plain.whatsappOAuthStateExpires ?? null,
    }
  }, { upsert: true });
}

// â”€â”€ Per-account processing lock to avoid race conditions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const accountLocks = new Map<string, Promise<void>>();
function withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  const prev = accountLocks.get(accountId) || Promise.resolve();
  const next = prev.then(fn, fn);
  accountLocks.set(accountId, next.then(() => {}, () => {}));
  return next;
}

// â”€â”€ Get KB context from uploaded docs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getKBContext(account: any): string {
  let context = '';
  for (const doc of account.documentos) {
    if (doc.extractedText) {
      context += `\n--- DOCUMENTO: ${doc.nombre} ---\n${doc.extractedText}\n`;
    } else {
      // Try reading from file
      const filePath = path.join(UPLOADS_DIR, doc.filename);
      if (fs.existsSync(filePath)) {
        try {
          // For PDFs we'd need pdf-parse, but extractedText should be stored
          // This is a fallback
        } catch { /* skip */ }
      }
    }
  }
  return context;
}

function getEmailFolderDescriptions(account: any): Array<{ id: string; nombre: string; descripcion: string }> {
  const folderIdsToRules = new Map<string, string[]>();
  for (const rule of account.emailClassifyRules || []) {
    for (const folderId of rule.folderIds || []) {
      const current = folderIdsToRules.get(folderId) || [];
      current.push(rule.description || rule.name || '');
      folderIdsToRules.set(folderId, current);
    }
  }

  return (account.emailFolders || []).map((folder: any) => ({
    id: folder.id,
    nombre: folder.name,
    descripcion: (folderIdsToRules.get(folder.id) || []).filter(Boolean).join(' | ') || `Carpeta ${folder.name}`,
  }));
}

function getWhatsAppFolderDescriptions(account: any): Array<{ id: string; nombre: string; descripcion: string }> {
  const folderIdsToRules = new Map<string, string[]>();
  for (const rule of account.whatsappClassifyRules || []) {
    for (const folderId of rule.folderIds || []) {
      const current = folderIdsToRules.get(folderId) || [];
      current.push(rule.description || rule.name || '');
      folderIdsToRules.set(folderId, current);
    }
  }

  return (account.emailFolders || []).map((folder: any) => ({
    id: folder.id,
    nombre: folder.name,
    descripcion: (folderIdsToRules.get(folder.id) || []).filter(Boolean).join(' | ') || `Carpeta ${folder.name}`,
  }));
}

function getEmailConversationFolderKey(conversationId: string): string {
  return `email:${conversationId}`;
}

function getWhatsAppConversationFolderKey(conversationId: string): string {
  return `whatsapp:${conversationId}`;
}

function buildEmailEngineMessages(
  existingMessages: any[],
  contactName: string,
  incomingEmail: IncomingEmail,
): AutomationEngineMessage[] {
  const prior = (existingMessages || []).map((message: any) => ({
    fechaHora: message.time || new Date().toISOString(),
    autor: message.sent ? 'asistente' as const : 'cliente' as const,
    canal: 'email' as const,
    texto: String(message.text || ''),
  }));

  prior.push({
    fechaHora: incomingEmail.date?.toISOString?.() || new Date().toISOString(),
    autor: 'cliente',
    canal: 'email',
    texto: String(incomingEmail.body || ''),
  });

  return prior.slice(-20);
}

function buildWhatsAppEngineMessages(messages: any[]): AutomationEngineMessage[] {
  return (messages || []).slice(-20).map((message: any) => ({
    fechaHora: message.time || new Date().toISOString(),
    autor: message.sent ? 'asistente' as const : 'cliente' as const,
    canal: 'whatsapp' as const,
    texto: String(message.text || ''),
  }));
}

async function assignEmailConversationToFolders(
  account: any,
  conversationId: string,
  folderIds: string[],
): Promise<void> {
  if (!conversationId || !Array.isArray(folderIds) || folderIds.length === 0) return;
  let modified = false;
  const valid = new Set(folderIds);
  const folderKey = getEmailConversationFolderKey(conversationId);
  for (const folder of account.emailFolders || []) {
    if (!valid.has(folder.id)) continue;
    folder.conversationIds = (folder.conversationIds || []).filter((cid: string) => cid !== conversationId);
    if (!folder.conversationIds.includes(folderKey)) {
      folder.conversationIds.push(folderKey);
      modified = true;
    }
  }
  if (modified) {
    await saveAccount(account);
  }
}

async function assignWhatsAppConversationToFolders(
  account: any,
  conversationId: string,
  folderIds: string[],
): Promise<void> {
  if (!conversationId || !Array.isArray(folderIds) || folderIds.length === 0) return;
  let modified = false;
  const valid = new Set(folderIds);
  const folderKey = getWhatsAppConversationFolderKey(conversationId);
  for (const folder of account.emailFolders || []) {
    if (!valid.has(folder.id)) continue;
    folder.conversationIds = (folder.conversationIds || []).filter((cid: string) => cid !== conversationId);
    if (!folder.conversationIds.includes(folderKey)) {
      folder.conversationIds.push(folderKey);
      modified = true;
    }
  }
  if (modified) {
    await saveAccount(account);
  }
}

// â”€â”€ Extract text from PDF (for new knowledge docs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function extractPdfText(pdfPath: string): Promise<string> {
  try {
    const pdfBuffer = await fsPromises.readFile(pdfPath);
    const pdfParseModule: any = await import('pdf-parse');
    const PDFParse = pdfParseModule.PDFParse;
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    return result.text || '';
  } catch {
    return '';
  }
}

// â”€â”€ Build email conversation history context for AI prompts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const EMAIL_HISTORY_CHAR_LIMIT = 100_000;
const EMAIL_KEEP_RECENT = 15;

async function buildEmailHistoryText(
  messages: Array<{ text: string; sent: boolean }>,
  contactLabel: string,
): Promise<string> {
  if (!messages || messages.length === 0) return '';
  const transcript = messages.map(m => `${m.sent ? 'Asistente' : contactLabel}: ${(m.text || '').substring(0, 2000)}`).join('\n\n');
  if (transcript.length <= EMAIL_HISTORY_CHAR_LIMIT) {
    return `\nCONTEXTO â€” CONVERSACIÃ“N PREVIA CON ESTE CLIENTE:\n${transcript}`;
  }
  // Too long: summarize older messages, keep most recent complete
  const recent = messages.slice(-EMAIL_KEEP_RECENT);
  const older = messages.slice(0, -EMAIL_KEEP_RECENT);
  const olderTranscript = older.map(m => `${m.sent ? 'Asistente' : contactLabel}: ${(m.text || '').substring(0, 1000)}`).join('\n\n');
  let summary = '';
  try {
    const res = await getQwen().chat.completions.create({
      model: AI_AUTOMATION_MODEL,
      messages: [
        { role: 'system', content: 'Resume brevemente esta conversaciÃ³n de email de un despacho legal. MÃ¡ximo 5 frases. Sin introducciones. /no_think' },
        { role: 'user', content: olderTranscript.substring(0, 40_000) },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });
    summary = stripThinkTags(res.choices?.[0]?.message?.content || '').trim();
  } catch (err) {
    console.error('[Email] Error summarizing history:', err);
  }
  const recentTranscript = recent.map(m => `${m.sent ? 'Asistente' : contactLabel}: ${(m.text || '').substring(0, 2000)}`).join('\n\n');
  if (summary) {
    return `\nRESUMEN DE LA CONVERSACIÃ“N PREVIA:\n${summary}\n\nMENSAJES RECIENTES:\n${recentTranscript}`;
  }
  return `\nCONTEXTO â€” MENSAJES RECIENTES:\n${recentTranscript}`;
}

async function composeClientReply(
  originalSubject: string,
  originalBody: string,
  rawInstruction: string,
  historyContext?: string,
): Promise<string> {
  try {
    const response = await getQwen().chat.completions.create({
      model: AI_AUTOMATION_MODEL,
      messages: [
        {
          role: 'system',
          content: `Eres el asistente de email de un despacho profesional. Tu tarea es redactar una respuesta breve y profesional para enviar a un cliente.

Se te proporcionarÃ¡:
1. La pregunta original del cliente (CONTEXTO â€” Ãºsala para entender a quÃ© se refiere la instrucciÃ³n)
2. La instrucciÃ³n/informaciÃ³n que te da el responsable del despacho (CONTENIDO â€” la informaciÃ³n que debes transmitir)

Reglas ESTRICTAS:
- Lee primero la pregunta del cliente para entender el contexto exacto. Luego aplica la instrucciÃ³n del responsable sobre ese contexto
- Por ejemplo: si el cliente preguntÃ³ "Â¿CuÃ¡nto cuesta el servicio de divorcio?" y el responsable dice "dile que 500â‚¬", tu respuesta debe mencionar "el servicio de divorcio" (tomado de la pregunta) y "500 â‚¬" (tomado de la instrucciÃ³n)
- Usa ÃšNICAMENTE la informaciÃ³n que te da el responsable. NO aÃ±adas, inventes ni amplÃ­es datos que no estÃ©n en la instrucciÃ³n
- NO incluyas firmas, nombres, telÃ©fonos, correos ni datos de contacto. NUNCA pongas placeholders como "[Nombre]", "[TelÃ©fono]", "[Despacho]" ni similares
- Estructura: saludo breve â†’ respuesta clara referenciando lo que el cliente preguntÃ³ â†’ despedida corta ("Un saludo" o "Quedamos a su disposiciÃ³n")
- Responde en el mismo idioma que el cliente
- No menciones que alguien te dio instrucciones`,
        },
        {
          role: 'user',
          content: `${historyContext ? historyContext + '\n\n' : ''}PREGUNTA DEL CLIENTE:\nAsunto: ${originalSubject}\n${originalBody.substring(0, 2000)}\n\nINSTRUCCIÃ“N DEL RESPONSABLE:\n${rawInstruction.substring(0, 2000)}\n/no_think`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const text = stripThinkTags(response.choices[0].message.content || '').trim();
    return text || rawInstruction;
  } catch (err) {
    console.error('[composeClientReply] Error:', err);
    return rawInstruction;
  }
}

// â”€â”€ 3. Forward to consultas correo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function forwardToConsultas(
  cuenta: CuentaCorreoConfig,
  correosConsultas: string[],
  email: IncomingEmail,
  account: any,
  cuentaCorreoId: string,
  conversationId: string,
  type: 'consulta_general' | 'solicitud_sin_especialista' | 'confirmacion_asignacion' = 'consulta_general',
  especialidadNombre?: string,
  especialidadId?: string,
  customMessage?: string,
): Promise<void> {
  if (correosConsultas.length === 0) return;

  const cleanBody = stripQuotedText(email.body);

  // Build AI-generated conversation context summary
  let contextSummary = '';
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (conv && conv.messages && conv.messages.length > 1) {
    try {
      const transcript = conv.messages.map((m: any) => {
        const who = m.sent ? 'Asistente' : (conv.contactName || conv.contactEmail);
        return `${who}: ${(m.text || '').substring(0, 800)}`;
      }).join('\n');

      const res = await getQwen().chat.completions.create({
        model: AI_AUTOMATION_MODEL,
        messages: [
          { role: 'system', content: 'Eres un asistente que resume conversaciones de email de un despacho de abogados. Genera un resumen breve y claro en espaÃ±ol de la conversaciÃ³n, destacando: el tema principal, lo que pide el cliente, y las respuestas que se le han dado. MÃ¡ximo 5 frases. No uses saludos ni introducciones, ve directo al resumen.' },
          { role: 'user', content: transcript },
        ],
        max_tokens: 300,
      });
      const summary = res.choices?.[0]?.message?.content?.trim();
      if (summary) {
        contextSummary = `\n\nRESUMEN DE LA CONVERSACIÃ“N PREVIA:\n${summary}`;
      }
    } catch (err) {
      console.error('[EmailProcessor] Error generating conversation summary:', err);
      // Fallback: list last 3 messages
      const last3 = conv.messages.slice(-3).map((m: any) => {
        const who = m.sent ? 'Asistente' : (conv.contactName || conv.contactEmail);
        return `${who}: ${(m.text || '').substring(0, 300)}`;
      });
      contextSummary = `\n\nÃšLTIMOS MENSAJES DE LA CONVERSACIÃ“N:\n${last3.join('\n')}`;
    }
  }

  let forwardBody: string;
  if (customMessage?.trim()) {
    forwardBody = `${customMessage.trim()}

DE: ${email.fromName} <${email.from}>
ASUNTO: ${email.subject}
MENSAJE:
${cleanBody}${contextSummary}`;
  } else if (type === 'solicitud_sin_especialista') {
    forwardBody = `Se ha recibido una solicitud de servicio de "${especialidadNombre || 'especialidad desconocida'}" pero no hay ningÃºn abogado asignado a esa especialidad.

DE: ${email.fromName} <${email.from}>
ASUNTO: ${email.subject}
MENSAJE:
${cleanBody}${contextSummary}

---
Responde a este email indicando quÃ© hacer. Ejemplos:
- "Dile que no ofrecemos ese servicio"
- "AsÃ­gnale el caso a [nombre del abogado]"
- "Pausa la respuesta automÃ¡tica para este cliente" (para atenderlo manualmente)
- O escribe directamente el mensaje que quieras enviar al cliente.`;
  } else {
    forwardBody = `Se ha recibido una consulta por email que no hemos podido responder automÃ¡ticamente. Por favor, indica cÃ³mo responder:

DE: ${email.fromName} <${email.from}>
ASUNTO: ${email.subject}
MENSAJE:
${cleanBody}${contextSummary}

---
Responde a este email con las instrucciones para la respuesta.
TambiÃ©n puedes escribir "pausa la respuesta automÃ¡tica" para desactivar las respuestas automÃ¡ticas de este cliente.`;
  }

  // Generate unique consulta ID
  const consultaId = Date.now().toString();

  // Forward original attachments so the consultas recipient can see them directly
  const fwdAttachments = email.attachments?.map(a => ({ filename: a.filename, content: a.content, mimeType: a.mimeType }));

  for (const consultaEmail of correosConsultas) {
    await sendEmailViaCuenta(cuenta, consultaEmail, `[Consulta pendiente] [CP-${consultaId}] ${email.subject}`, forwardBody, fwdAttachments);
  }

  // Save pending consulta on the caller's account object (avoid race condition)
  account.pendingConsultas.push({
    id: consultaId,
    originalFrom: email.from,
    originalFromName: email.fromName,
    originalSubject: email.subject,
    originalBody: cleanBody,
    cuentaCorreoId,
    conversationId,
    forwardedAt: new Date().toISOString(),
    type,
    especialidadId,
    channel: 'email',
  });
  await saveAccount(account);
}

// â”€â”€ Helper: strip quoted text from email replies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function stripQuotedText(body: string): string {
  const lines = body.split('\n');
  const cleanLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Gmail Spanish: "El lun, 28 feb 2026, 21:42, <email> escribiÃ³:"
    if (/^El\s+.+escribi[oÃ³]:\s*$/i.test(trimmed)) break;

    // Gmail English: "On Mon, Feb 28, 2026 at 9:42 PM <email> wrote:"
    if (/^On\s+.+wrote:\s*$/i.test(trimmed)) break;

    // Gmail German: "Am Mo., 28. Feb. 2026 um 21:42 Uhr schrieb <email>:"
    if (/^Am\s+.+schrieb\s+/i.test(trimmed)) break;

    // Gmail French: "Le lun. 28 fÃ©vr. 2026 Ã  21:42, <email> a Ã©crit :"
    if (/^Le\s+.+a\s+[eÃ©]crit\s*:/i.test(trimmed)) break;

    // Gmail Portuguese: "Em seg., 28 de fev. de 2026 Ã s 21:42, <email> escreveu:"
    if (/^Em\s+.+escreveu:\s*$/i.test(trimmed)) break;

    // Gmail Italian: "Il giorno lun 28 feb 2026 alle ore 21:42 <email> ha scritto:"
    if (/^Il\s+giorno\s+.+ha\s+scritto:\s*$/i.test(trimmed)) break;

    // Apple Mail: various patterns with date lines
    if (/^(>?\s*)?El\s+\d{1,2}\s+\w+\s+\d{4},?\s+a\s+las?\s+\d{1,2}:\d{2}/i.test(trimmed)) break;

    // Thunderbird: "-------- Original Message --------" or "-------- Forwarded Message --------"
    if (/^-{4,}\s*(Original|Forwarded|Reenviar|Mensaje original)\s*(Message|mensaje)?\s*-{4,}$/i.test(trimmed)) break;

    // Outlook separator line
    if (trimmed.startsWith('________________________________')) break;

    // Outlook From/Sent block (multiple languages)
    if (/^From:\s+/i.test(trimmed) && i + 1 < lines.length && /^Sent:\s+/i.test(lines[i + 1].trim())) break;
    if (/^De:\s+/i.test(trimmed) && i + 1 < lines.length && /^Enviado:\s+/i.test(lines[i + 1].trim())) break;
    if (/^Von:\s+/i.test(trimmed) && i + 1 < lines.length && /^Gesendet:\s+/i.test(lines[i + 1].trim())) break;

    // Generic: block of quoted lines (all remaining lines start with >)
    if (trimmed.startsWith('>')) {
      const allQuoted = lines.slice(i).every(l => l.trim().startsWith('>') || l.trim() === '');
      if (allQuoted) break;
    }

    cleanLines.push(lines[i]);
  }

  // Trim trailing empty lines
  while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') {
    cleanLines.pop();
  }

  return cleanLines.join('\n').trim() || body.trim();
}

function sanitizePhoneForWA(phone: string): string {
  return (phone || '').replace(/[^0-9]/g, '');
}

const WA_CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;

function getLastIncomingWhatsAppTimestamp(conversation: any): number | null {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.sent) continue;

    const timestamp = new Date(message?.time || '').getTime();
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return null;
}

function isPendingWhatsAppConversationOutside24h(conversation: any, now = Date.now()): boolean {
  const lastIncomingTimestamp = getLastIncomingWhatsAppTimestamp(conversation);
  if (lastIncomingTimestamp === null) return false;
  return now - lastIncomingTimestamp > WA_CUSTOMER_CARE_WINDOW_MS;
}

async function sendWhatsAppReplyFromPending(
  account: any,
  toPhone: string,
  text: string,
  options?: { waConversationId?: string; waContactPhone?: string },
): Promise<void> {
  const session = resolvePendingWhatsAppSession(account, options?.waConversationId, options?.waContactPhone);
  const phoneNumberId = session?.phoneNumberId || '';
  const encryptedToken = session?.accessToken || '';
  const accessToken = decryptPassword(encryptedToken);
  const to = sanitizePhoneForWA(toPhone);

  if (!phoneNumberId || !accessToken || !to) {
    throw new Error('WhatsApp Meta no estÃ¡ conectado correctamente para enviar la respuesta');
  }

  const conversation = (account.whatsappConversations || []).find((c: any) =>
    (options?.waConversationId && c.id === options.waConversationId)
    || (options?.waContactPhone && sanitizePhoneForWA(c.contactPhone) === sanitizePhoneForWA(options.waContactPhone))
  );

  if (conversation && isPendingWhatsAppConversationOutside24h(conversation)) {
    throw new Error('Meta bloquea mensajes libres fuera de 24 horas. El cliente debe volver a escribir para reabrir la ventana.');
  }

  const res = await fetch(`${META_GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text.substring(0, 4096) },
    }),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => '');
    throw new Error(`Error enviando respuesta WhatsApp (${res.status}): ${details}`);
  }
}

function appendOutgoingWhatsAppMessage(account: any, waConversationId: string | undefined, waContactPhone: string | undefined, text: string): void {
  if (!waConversationId && !waContactPhone) return;

  const conv = (account.whatsappConversations || []).find((c: any) =>
    (waConversationId && c.id === waConversationId)
    || (waContactPhone && sanitizePhoneForWA(c.contactPhone) === sanitizePhoneForWA(waContactPhone))
  );
  if (!conv) return;

  conv.messages.push({
    id: `wa_manual_${Date.now()}`,
    from: 'lyra',
    text,
    time: new Date().toISOString(),
    sent: true,
  });
  conv.lastMessageTime = new Date().toISOString();
}

// â”€â”€ 3b. Interpret consulta action (AI) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ConsultaInstructionAction = 'reject' | 'assign' | 'reply' | 'pause' | 'unclear';

interface ConsultaInstructionInterpretation {
  action: ConsultaInstructionAction;
  message?: string;
  assignToName?: string;
  confidence?: 'high' | 'medium' | 'low';
}

function shouldHoldConsultaInstruction(interpretation: ConsultaInstructionInterpretation): boolean {
  if (interpretation.action === 'unclear') return true;
  if (interpretation.confidence === 'low') return true;
  if (interpretation.action === 'assign') return !interpretation.assignToName?.trim();
  if (interpretation.action === 'reply' || interpretation.action === 'reject') return !interpretation.message?.trim();
  return false;
}

export async function interpretConsultaAction(
  replyText: string,
  originalSubject: string,
  originalBody: string,
  subaccountNames: string[],
): Promise<ConsultaInstructionInterpretation> {
  const subNamesStr = subaccountNames.length > 0 ? subaccountNames.join(', ') : 'Ninguno disponible';

  try {
    const response = await getQwen().chat.completions.create({
      model: AI_AUTOMATION_MODEL,
      messages: [
        {
          role: 'system',
          content: `Eres un asistente que interpreta instrucciones internas de un responsable de despacho sobre cÃ³mo actuar con un cliente.

La instrucciÃ³n del responsable puede estar en cualquier idioma, mezclar idiomas, contener faltas, abreviaturas o ser indirecta.

Debes clasificarla en UNA sola acciÃ³n:
- "reject": Indica que NO se ofrece el servicio o que hay que rechazar la peticiÃ³n. Genera el mensaje final para el cliente.
- "assign": Indica asignar el caso a un abogado concreto. Extrae el nombre del abogado.
- "reply": Da informaciÃ³n o instrucciones para responder al cliente. Genera el mensaje final para el cliente.
- "pause": Indica que se pause o desactive la respuesta automÃ¡tica para este cliente o conversaciÃ³n. No redactes mensaje para el cliente.
- "unclear": La instrucciÃ³n es ambigua, incompleta, contradictoria, demasiado interna o no estÃ¡s seguro de interpretarla con seguridad.

Reglas estrictas:
- Prioriza la seguridad. Si dudas entre varias acciones, usa "unclear".
- Si la acciÃ³n es "reply" o "reject", el campo "message" debe ser el texto FINAL listo para enviar al cliente.
- Ese mensaje debe ser breve, profesional, sin firmas ni placeholders, y en el mismo idioma que el cliente segÃºn la consulta original.
- Usa SOLO la informaciÃ³n dada por el responsable y el contexto original del cliente. No inventes datos.
- Si la acciÃ³n es "assign", usa "assignToName" con el nombre mÃ¡s claro posible.

Abogados disponibles: ${subNamesStr}

Responde SOLO con JSON vÃ¡lido:
{"action": "reject"|"assign"|"reply"|"pause"|"unclear", "message": "texto final para el cliente si aplica", "assignToName": "nombre solo para assign", "confidence": "high"|"medium"|"low"}
/no_think`,
        },
        {
          role: 'user',
          content: `CONSULTA ORIGINAL DEL CLIENTE:\nAsunto: ${originalSubject}\nMensaje: ${originalBody}\n\nRESPUESTA DEL RESPONSABLE:\n${replyText}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || '';
    const cleaned = stripThinkTags(content).trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const action = parsed?.action;
      if (action === 'reject' || action === 'assign' || action === 'reply' || action === 'pause' || action === 'unclear') {
        return {
          action,
          message: typeof parsed?.message === 'string' ? parsed.message.trim() : undefined,
          assignToName: typeof parsed?.assignToName === 'string' ? parsed.assignToName.trim() : undefined,
          confidence: parsed?.confidence === 'high' || parsed?.confidence === 'medium' || parsed?.confidence === 'low'
            ? parsed.confidence
            : 'low',
        };
      }
    }
    console.warn('[interpretConsultaAction] No valid JSON found in AI response');
  } catch (err) {
    console.error('Error interpretando respuesta de consulta:', err);
  }

  return { action: 'unclear', confidence: 'low' };
}

async function processConsultaReply(
  reply: IncomingEmail,
  accountId: string,
  incomingCuentaCorreo?: CuentaCorreo,
): Promise<boolean> {
  const account = await getAccount(accountId);

  const pendingIdx = findPendingConsultaIndex(account, reply, incomingCuentaCorreo);

  if (pendingIdx === -1) return false;

  const pending = account.pendingConsultas[pendingIdx];
  const cleanReply = stripQuotedText(reply.body);

  const cuentaCorreo = findCuentaCorreo(account, pending.cuentaCorreoId);
  if (!cuentaCorreo && pending.channel !== 'whatsapp') {
    account.pendingConsultas.splice(pendingIdx, 1);
    await saveAccount(account);
    return true;
  }

  const cuentaConfig: CuentaCorreoConfig | null = cuentaCorreo ? toCuentaConfig(cuentaCorreo) : null;

  if (pending.channel === 'whatsapp') {
    const waTargetPhone = pending.waContactPhone || pending.originalFrom;
    const waConv = (account.whatsappConversations || []).find((c: any) =>
      (pending.waConversationId && c.id === pending.waConversationId)
      || (waTargetPhone && sanitizePhoneForWA(c.contactPhone) === sanitizePhoneForWA(waTargetPhone))
    );

    if (pending.type === 'solicitud_sin_especialista') {
      const subaccounts = await Subaccount.find({ parentAccountId: accountId });
      const subNames = subaccounts.map((s: any) => s.name || s.email);
      const interpretation = await interpretConsultaAction(
        cleanReply,
        pending.originalSubject,
        pending.originalBody,
        subNames,
      );

      if (shouldHoldConsultaInstruction(interpretation)) {
        console.warn(`[processConsultaReply] InstrucciÃ³n ambigua de consultas para WhatsApp, se mantiene pendiente: ${pending.id}`);
        await saveAccount(account);
        return true;
      }

      if (interpretation.action === 'assign' && interpretation.assignToName) {
        const targetName = interpretation.assignToName.toLowerCase();
        const targetSub = subaccounts.find((s: any) =>
          (s.name || '').toLowerCase().includes(targetName)
          || (s.email || '').toLowerCase().includes(targetName)
        );

        if (!targetSub) {
          console.warn(`[processConsultaReply] No se encontrÃ³ subcuenta para la instrucciÃ³n de asignaciÃ³n WhatsApp, se mantiene pendiente: ${pending.id}`);
          await saveAccount(account);
          return true;
        }

        const assigned = await assignWhatsAppCaseToSubaccount(accountId, account, targetSub, {
          contactName: pending.originalFromName,
          contactPhone: waTargetPhone,
          conversationId: pending.waConversationId || pending.conversationId,
          originalText: pending.originalBody,
          especialidadId: pending.especialidadId,
        });
        const waHistoryContext = (waConv?.messages?.length ?? 0) > 0
          ? `HISTORIAL:\n${waConv!.messages.slice(-20).map((m: any) => `${m.sent ? 'Asistente' : (waConv?.contactName || pending.originalFromName)}: ${m.text}`).join('\n')}`
          : '';
        const ackMsg = assigned
          ? await generateOperationalClientReply({
            channel: 'whatsapp',
            scenario: 'assigned_case',
            originalSubject: pending.originalSubject,
            originalBody: pending.originalBody,
            latestCustomerText: cleanReply,
            historyContext: waHistoryContext,
          })
          : await generateOperationalClientReply({
            channel: 'whatsapp',
            scenario: 'under_review',
            originalSubject: pending.originalSubject,
            originalBody: pending.originalBody,
            latestCustomerText: cleanReply,
            historyContext: waHistoryContext,
          });
        if (!ackMsg) {
          console.warn(`[processConsultaReply] No se pudo redactar respuesta IA de asignacion WhatsApp, se mantiene pendiente: ${pending.id}`);
          await saveAccount(account);
          return true;
        }
        try {
          await sendWhatsAppReplyFromPending(account, waTargetPhone, ackMsg, {
            waConversationId: pending.waConversationId || pending.conversationId,
            waContactPhone: waTargetPhone,
          });
          appendOutgoingWhatsAppMessage(account, pending.waConversationId || pending.conversationId, waTargetPhone, ackMsg);
        } catch (err) {
          console.error('[processConsultaReply] Error enviando respuesta WhatsApp de asignaciÃ³n:', err);
          await saveAccount(account);
          return true;
        }
      } else if (interpretation.action === 'pause') {
        if (waConv) {
          waConv.autoReplyPaused = true;
          waConv.lastMessageTime = new Date().toISOString();
        }
      } else {
        const msg = interpretation.message?.trim();
        if (!msg) {
          await saveAccount(account);
          return true;
        }
        try {
          await sendWhatsAppReplyFromPending(account, waTargetPhone, msg, {
            waConversationId: pending.waConversationId || pending.conversationId,
            waContactPhone: waTargetPhone,
          });
          appendOutgoingWhatsAppMessage(account, pending.waConversationId || pending.conversationId, waTargetPhone, msg);
        } catch (err) {
          console.error('[processConsultaReply] Error enviando respuesta WhatsApp manual:', err);
          await saveAccount(account);
          return true;
        }
      }

      account.pendingConsultas.splice(pendingIdx, 1);
      await saveAccount(account);
      return true;
    }

    const interpretation = await interpretConsultaAction(
      cleanReply,
      pending.originalSubject,
      pending.originalBody,
      [],
    );

    if (shouldHoldConsultaInstruction(interpretation)) {
      console.warn(`[processConsultaReply] InstrucciÃ³n ambigua de consultas para WhatsApp, se mantiene pendiente: ${pending.id}`);
      await saveAccount(account);
      return true;
    }

    if (interpretation.action === 'pause') {
      if (waConv) {
        waConv.autoReplyPaused = true;
        waConv.lastMessageTime = new Date().toISOString();
      }

      account.pendingConsultas.splice(pendingIdx, 1);
      await saveAccount(account);
      return true;
    }

    if (interpretation.action !== 'reply' && interpretation.action !== 'reject') {
      console.warn(`[processConsultaReply] AcciÃ³n no enviable al cliente para WhatsApp, se mantiene pendiente: ${pending.id}`);
      await saveAccount(account);
      return true;
    }

    const docId = Date.now().toString();
    const docFilename = `consulta_wa_${docId}.txt`;
    const docPath = path.join(UPLOADS_DIR, docFilename);

    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    const docContent = `Canal: WhatsApp\nTema: ${pending.originalSubject}\nPregunta del cliente: ${pending.originalBody}\nRespuesta del despacho: ${cleanReply}`;
    fs.writeFileSync(docPath, docContent, 'utf-8');

    account.documentos.push({
      id: docId,
      nombre: `Respuesta WA: ${pending.originalSubject.substring(0, 50)}`,
      filename: docFilename,
      extractedText: docContent,
      uploadedAt: new Date().toISOString(),
    });

    const waHistCtx = (waConv?.messages?.length ?? 0) > 0
      ? `CONTEXTO â€” CONVERSACION PREVIA DE WHATSAPP:\n${waConv!.messages.slice(-20).map((m: any) => `${m.sent ? 'Asistente' : (waConv?.contactName || pending.originalFromName)}: ${m.text}`).join('\n')}`
      : '';

    const composedReply = interpretation.message || await composeClientReply(
      pending.originalSubject,
      pending.originalBody,
      cleanReply,
      waHistCtx,
    );

    try {
      await sendWhatsAppReplyFromPending(account, waTargetPhone, composedReply, {
        waConversationId: pending.waConversationId || pending.conversationId,
        waContactPhone: waTargetPhone,
      });
      appendOutgoingWhatsAppMessage(account, pending.waConversationId || pending.conversationId, waTargetPhone, composedReply);
    } catch (err) {
      console.error('[processConsultaReply] Error enviando respuesta a WhatsApp:', err);
      await saveAccount(account);
      return true;
    }

    account.pendingConsultas.splice(pendingIdx, 1);
    await saveAccount(account);
    return true;
  }

  if (pending.type === 'solicitud_sin_especialista') {
    const subaccounts = await Subaccount.find({ parentAccountId: accountId });
    const subNames = subaccounts.map((s: any) => s.name || s.email);

    const interpretation = await interpretConsultaAction(
      cleanReply,
      pending.originalSubject,
      pending.originalBody,
      subNames,
    );

    if (shouldHoldConsultaInstruction(interpretation)) {
      console.warn(`[processConsultaReply] InstrucciÃ³n ambigua de consultas por email, se mantiene pendiente: ${pending.id}`);
      await saveAccount(account);
      return true;
    }

    const conv = account.emailConversations.find((c: any) => c.id === pending.conversationId);
    const timeStr = new Date().toISOString();

    if (interpretation.action === 'assign' && interpretation.assignToName) {
      if (cuentaConfig && cuentaCorreo) {
        const origEmail: IncomingEmail = {
          from: pending.originalFrom,
          fromName: pending.originalFromName,
          to: cuentaCorreo.correo,
          subject: pending.originalSubject,
          body: pending.originalBody,
          date: new Date(pending.forwardedAt),
          messageId: '',
          references: '',
        };
        const assignedOk = await assignCaseToNamedCandidate(
          origEmail,
          accountId,
          account,
          interpretation.assignToName,
          cuentaCorreo,
          pending.conversationId,
          pending.especialidadId,
        );
        if (!assignedOk) {
          console.warn(`[processConsultaReply] No se encontro candidata de asignacion por email, se mantiene pendiente: ${pending.id}`);
          await saveAccount(account);
          return true;
        }

        const historyContext = conv
          ? await buildEmailHistoryText(conv.messages, conv.contactName || pending.originalFromName)
          : '';
        const ackMsg = await generateOperationalClientReply({
          channel: 'email',
          scenario: 'assigned_case',
          originalSubject: pending.originalSubject,
          originalBody: pending.originalBody,
          latestCustomerText: cleanReply,
          historyContext,
        });
        if (!ackMsg) {
          await saveAccount(account);
          return true;
        }
        await replyToEmail(cuentaConfig, pending.originalFrom, pending.originalSubject, ackMsg);
        if (conv) {
          conv.messages.push({ id: Date.now().toString(), from: 'Asistente', text: ackMsg, time: timeStr, sent: true });
          conv.lastMessageTime = new Date().toISOString();
        }
      } else {
        console.warn(`[processConsultaReply] No se encontrÃ³ subcuenta para la instrucciÃ³n de asignaciÃ³n por email, se mantiene pendiente: ${pending.id}`);
        await saveAccount(account);
        return true;
      }
    } else if (interpretation.action === 'pause') {
      if (conv) {
        conv.autoReplyPaused = true;
        conv.lastMessageTime = new Date().toISOString();
      }
    } else if (cuentaConfig) {
      const msg = interpretation.message?.trim();
      if (!msg) {
        await saveAccount(account);
        return true;
      }
      await replyToEmail(cuentaConfig, pending.originalFrom, pending.originalSubject, msg);
      if (conv) {
        conv.messages.push({ id: Date.now().toString(), from: 'Asistente', text: msg, time: timeStr, sent: true });
        conv.lastMessageTime = new Date().toISOString();
      }
    }
  } else if (cuentaConfig) {
    const interpretation = await interpretConsultaAction(
      cleanReply,
      pending.originalSubject,
      pending.originalBody,
      [],
    );

    if (shouldHoldConsultaInstruction(interpretation)) {
      console.warn(`[processConsultaReply] InstrucciÃ³n ambigua de consultas por email, se mantiene pendiente: ${pending.id}`);
      await saveAccount(account);
      return true;
    }

    if (interpretation.action === 'pause') {
      const convPause = account.emailConversations.find((c: any) => c.id === pending.conversationId);
      if (convPause) {
        convPause.autoReplyPaused = true;
        convPause.lastMessageTime = new Date().toISOString();
      }

      account.pendingConsultas.splice(pendingIdx, 1);
      await saveAccount(account);
      return true;
    }

    if (interpretation.action !== 'reply' && interpretation.action !== 'reject') {
      console.warn(`[processConsultaReply] AcciÃ³n no enviable al cliente por email, se mantiene pendiente: ${pending.id}`);
      await saveAccount(account);
      return true;
    }

    const docId = Date.now().toString();
    const docFilename = `consulta_${docId}.txt`;
    const docPath = path.join(UPLOADS_DIR, docFilename);

    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    const docContent = `Tema: ${pending.originalSubject}\nPregunta del cliente: ${pending.originalBody}\nRespuesta del despacho: ${cleanReply}`;
    fs.writeFileSync(docPath, docContent, 'utf-8');

    account.documentos.push({
      id: docId,
      nombre: `Respuesta consulta: ${pending.originalSubject.substring(0, 50)}`,
      filename: docFilename,
      extractedText: docContent,
      uploadedAt: new Date().toISOString(),
    });

    const conv = account.emailConversations.find((c: any) => c.id === pending.conversationId);
    const histCtx = (conv?.messages?.length ?? 0) > 0
      ? await buildEmailHistoryText(conv!.messages, conv!.contactName || pending.originalFromName)
      : '';
    const composedReply = interpretation.message || await composeClientReply(
      pending.originalSubject,
      pending.originalBody,
      cleanReply,
      histCtx,
    );
    await replyToEmail(cuentaConfig, pending.originalFrom, pending.originalSubject, composedReply);
    if (conv) {
      conv.messages.push({
        id: Date.now().toString(),
        from: 'Asistente',
        text: composedReply,
        time: new Date().toISOString(),
        sent: true,
      });
      conv.lastMessageTime = new Date().toISOString();
    }
  }

  account.pendingConsultas.splice(pendingIdx, 1);
  await saveAccount(account);
  return true;
}

// â”€â”€ 4b. Check if a matching specialist exists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function generateCaseSummary(
  email: IncomingEmail,
  account: any,
  conversationId: string,
  espName: string,
  lawyerName: string,
): Promise<string> {
  // Gather conversation messages for context
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  let conversationText = '';
  if (conv && conv.messages.length > 0) {
    conversationText = conv.messages.map((m: any) => `${m.sent ? 'Asistente' : m.from}: ${m.text}`).join('\n\n');
  } else {
    conversationText = `${email.fromName || email.from}: ${email.body.substring(0, 2000)}`;
  }

  try {
    const response = await getQwen().chat.completions.create({
      model: AI_AUTOMATION_MODEL,
      messages: [
        {
          role: 'system',
          content: `Genera un resumen breve y natural de un caso legal basÃ¡ndote en la conversaciÃ³n por email con el cliente. El resumen debe ser profesional, en tercera persona, y mencionar el tipo de caso y las caracterÃ­sticas principales. Incluye a quÃ© abogado ha sido asignado.
MÃ¡ximo 2-3 frases. No uses formato de lista ni encabezados. Escribe de forma natural.
/no_think`,
        },
        {
          role: 'user',
          content: `Especialidad: ${espName}\nAbogado asignado: ${lawyerName}\n\nConversaciÃ³n:\n${conversationText}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = stripThinkTags(response.choices[0]?.message?.content || '').trim();
    if (content && content.length > 10) return content;
  } catch (err) {
    console.error('[generateCaseSummary] Error:', err);
  }

  // Fallback
  return `Caso de ${espName}: solicitud recibida por email. Asignado a ${lawyerName}.`;
}

async function generateWhatsAppCaseSummary(
  account: any,
  conversationId: string,
  contactName: string,
  contactPhone: string,
  originalText: string,
  espName: string,
  lawyerName: string,
): Promise<string> {
  const conv = account.whatsappConversations?.find((c: any) => c.id === conversationId);
  let conversationText = '';

  if (conv && Array.isArray(conv.messages) && conv.messages.length > 0) {
    conversationText = conv.messages
      .map((m: any) => `${m.sent ? 'Asistente' : (conv.contactName || contactName || contactPhone)}: ${m.text}`)
      .join('\n\n');
  } else {
    conversationText = `${contactName || contactPhone}: ${originalText.substring(0, 2000)}`;
  }

  try {
    const response = await getQwen().chat.completions.create({
      model: AI_AUTOMATION_MODEL,
      messages: [
        {
          role: 'system',
          content: `Genera un resumen breve y natural de un caso legal basÃ¡ndote en una conversaciÃ³n de WhatsApp con el cliente. El resumen debe ser profesional, en tercera persona, y mencionar el tipo de caso y las caracterÃ­sticas principales. Incluye a quÃ© abogado ha sido asignado.
MÃ¡ximo 2-3 frases. No uses formato de lista ni encabezados. Escribe de forma natural.
/no_think`,
        },
        {
          role: 'user',
          content: `Especialidad: ${espName}\nAbogado asignado: ${lawyerName}\n\nConversaciÃ³n:\n${conversationText.substring(0, 12000)}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = stripThinkTags(response.choices[0]?.message?.content || '').trim();
    if (content && content.length > 10) return content;
  } catch (err) {
    console.error('[generateWhatsAppCaseSummary] Error:', err);
  }

  return `Caso de ${espName}: solicitud recibida por WhatsApp. Asignado a ${lawyerName}.`;
}

async function notifySubaccountAssignment(
  account: any,
  toEmail: string,
  subject: string,
  body: string,
): Promise<void> {
  const cuentaCorreo = account.cuentasCorreo?.[0];
  if (!cuentaCorreo?.correo) return;

  const cuentaConfig = toCuentaConfig(cuentaCorreo);

  try {
    await sendEmailViaCuenta(cuentaConfig, toEmail, subject, body);
  } catch (err) {
    console.error('[notifySubaccountAssignment] Error enviando notificaciÃ³n:', err);
  }
}

export async function assignWhatsAppCaseToSubaccount(
  accountId: string,
  account: any,
  subaccount: any,
  options: {
    contactName: string;
    contactPhone: string;
    conversationId: string;
    originalText: string;
    especialidadId?: string;
  },
): Promise<{ subaccountId: string; subaccountName: string; email: string } | null> {
  if (!subaccount?._id) return null;

  const clientId = Date.now().toString();
  const espName = account.especialidades.find((e: any) => e.id === options.especialidadId)?.nombre || 'General';
  const lawyerName = subaccount.name || subaccount.email;
  const aiSummary = await generateWhatsAppCaseSummary(
    account,
    options.conversationId,
    options.contactName,
    options.contactPhone,
    options.originalText,
    espName,
    lawyerName,
  );

  const { client } = await findOrCreateClient(
    accountId,
    undefined,
    options.contactPhone,
    options.contactName || options.contactPhone,
  );
  await addSubaccountToClient(client._id, subaccount._id);

  // Actualizar caso con linkedClientId
  try {
    const CaseModel = (await import('../models/Case.js')).default;
    await CaseModel.findOneAndUpdate(
      { accountId, sourceId: options.conversationId, status: 'pending' },
      { linkedClientId: client._id }
    );
  } catch (err) {
    console.error('[WhatsApp] error updating case linkedClientId:', err);
  }

  const lawyerNotification = `Nuevo cliente asignado automÃ¡ticamente desde WhatsApp.

DATOS DEL CLIENTE:
- Nombre: ${options.contactName || options.contactPhone}
- TelÃ©fono: ${options.contactPhone}
- Especialidad: ${espName}

RESUMEN DEL CASO:
${aiSummary}

---
Este cliente ha sido asignado a tu cuenta automÃ¡ticamente.`;

  await notifySubaccountAssignment(
    account,
    subaccount.email,
    `[Nuevo cliente] ${options.contactName || options.contactPhone} â€” ${espName}`,
    lawyerNotification,
  );

  return {
    subaccountId: String(subaccount._id),
    subaccountName: subaccount.name || subaccount.email || '',
    email: subaccount.email || '',
  };
}

export async function assignWhatsAppCase(
  accountId: string,
  account: any,
  options: {
    contactName: string;
    contactPhone: string;
    conversationId: string;
    originalText: string;
    especialidadId?: string;
  },
): Promise<{ subaccountId: string; subaccountName: string; email: string } | null> {
  const bestCandidate = await selectBestAssignableCandidate(
    accountId,
    account.subcuentaEspecialidades || {},
    options.especialidadId,
  );
  if (!bestCandidate) {
    console.warn(`[assignWhatsAppCase] No assignable candidates available for workspace ${accountId} - case for ${options.contactPhone} not assigned`);
    return null;
  }

  const resolvedCandidate = await resolveAssignmentCandidateRecord(accountId, bestCandidate.id);
  if (!resolvedCandidate) return null;

  return assignWhatsAppCaseToSubaccount(accountId, account, resolvedCandidate.record, options);
}

// â”€â”€ 4d. Assign case to a specific subaccount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function assignWhatsAppCaseToCandidateId(
  accountId: string,
  account: any,
  candidateId: string,
  options: {
    contactName: string;
    contactPhone: string;
    conversationId: string;
    originalText: string;
    especialidadId?: string;
  },
): Promise<{ subaccountId: string; subaccountName: string; email: string } | null> {
  const candidate = await resolveAssignmentCandidateRecord(accountId, candidateId);
  if (!candidate?.record) return null;
  return assignWhatsAppCaseToSubaccount(accountId, account, candidate.record, options);
}

async function assignCaseToSubaccount(
  email: IncomingEmail,
  accountId: string,
  account: any,
  subaccount: any,
  cuentaCorreo: CuentaCorreo,
  conversationId: string,
  especialidadId?: string,
): Promise<void> {
  const espName = account.especialidades.find((e: any) => e.id === especialidadId)?.nombre || 'General';
  const lawyerName = subaccount.name || subaccount.email;

  // Generate AI summary
  const aiSummary = await generateCaseSummary(email, account, conversationId, espName, lawyerName);

  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  const { client, created } = await findOrCreateClient(
    accountId,
    email.from,
    '',
    email.fromName || email.from,
    createAutomationClientId(),
  );
  if (conv) {
    conv.autoClientId = created ? client._id : undefined;
  }
  try {
    await saveAccount(account);
  } catch (err) {
    if (created) {
      await Client.deleteOne({ _id: client._id }).catch(() => {});
    }
    throw err;
  }
  await addSubaccountToClient(client._id, subaccount._id);

  await createCaseFromEmail(accountId, account, email, conversationId, especialidadId, 'solicitud_servicio', 'assigned', subaccount._id, subaccount.name || subaccount.email, client._id);

  const cuentaConfig = toCuentaConfig(cuentaCorreo);

  const lawyerNotification = `Nuevo cliente asignado.\n\nDATOS DEL CLIENTE:\n- Nombre: ${email.fromName || email.from}\n- Email: ${email.from}\n- Especialidad: ${espName}\n\nRESUMEN DEL CASO:\n${aiSummary}\n\n---\nEste cliente ha sido asignado a tu cuenta.`;

  try {
    await sendEmailViaCuenta(
      cuentaConfig,
      subaccount.email,
      `[Nuevo cliente] ${email.fromName || email.from} â€” ${espName}`,
      lawyerNotification,
    );
  } catch (err) {
    console.error('Error enviando notificaciÃ³n al abogado:', err);
  }
}

// â”€â”€ 5. Assign case â€” create client + notify lawyer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function findAssignmentCandidateByName(
  accountId: string,
  candidateNameOrEmail: string,
): Promise<ResolvedAssignmentCandidate | null> {
  const needle = String(candidateNameOrEmail || '').trim().toLowerCase();
  if (!needle) return null;

  const candidates = await listAssignmentCandidatesWithRecords(accountId);
  return candidates.find((candidate) =>
    (candidate.name || '').toLowerCase().includes(needle)
    || (candidate.email || '').toLowerCase().includes(needle)
  ) || null;
}

async function assignCaseToNamedCandidate(
  email: IncomingEmail,
  accountId: string,
  account: any,
  candidateNameOrEmail: string,
  cuentaCorreo: CuentaCorreo,
  conversationId: string,
  especialidadId?: string,
): Promise<boolean> {
  const candidate = await findAssignmentCandidateByName(accountId, candidateNameOrEmail);
  if (!candidate?.record) return false;
  await assignCaseToSubaccount(email, accountId, account, candidate.record, cuentaCorreo, conversationId, especialidadId);
  return true;
}

async function assignCaseUnified(
  email: IncomingEmail,
  accountId: string,
  account: any,
  especialidadId: string | undefined,
  cuentaCorreo: CuentaCorreo,
  conversationId: string,
): Promise<boolean> {
  const bestCandidate = await selectBestAssignableCandidate(
    accountId,
    account.subcuentaEspecialidades || {},
    especialidadId,
  );
  if (!bestCandidate) return false;

  const resolvedCandidate = await resolveAssignmentCandidateRecord(accountId, bestCandidate.id);
  if (!resolvedCandidate?.record) return false;

  await assignCaseToSubaccount(
    email,
    accountId,
    account,
    resolvedCandidate.record,
    cuentaCorreo,
    conversationId,
    especialidadId,
  );
  return true;
}

async function assignCaseToCandidateId(
  email: IncomingEmail,
  accountId: string,
  account: any,
  candidateId: string,
  cuentaCorreo: CuentaCorreo,
  conversationId: string,
  especialidadId?: string,
): Promise<boolean> {
  const candidate = await resolveAssignmentCandidateRecord(accountId, candidateId);
  if (!candidate?.record) return false;
  await assignCaseToSubaccount(email, accountId, account, candidate.record, cuentaCorreo, conversationId, especialidadId);
  return true;
}

async function hasExistingCase(accountId: string, source: 'email' | 'whatsapp', sourceId: string): Promise<boolean> {
  try {
    const CaseModel = (await import('../models/Case.js')).default;
    const found = await CaseModel.findOne({ accountId, source, sourceId }).select('_id').lean();
    return !!found;
  } catch (err) {
    console.error('[hasExistingCase] error:', err);
    return false;
  }
}

export async function generateOperationalClientReply(options: {
  channel: 'email' | 'whatsapp';
  scenario: 'assigned_case' | 'assignment_declined' | 'under_review';
  originalSubject: string;
  originalBody: string;
  latestCustomerText?: string;
  historyContext?: string;
}): Promise<string | null> {
  const scenarioInstruction =
    options.scenario === 'assigned_case'
      ? 'Ya se ha asignado un abogado o profesional adecuado al cliente y el mensaje debe comunicarlo claramente.'
      : options.scenario === 'assignment_declined'
        ? 'El cliente ha indicado que no desea que se le asigne abogado en este momento.'
        : 'El asunto sigue en revision interna y no debes inventar detalles ni prometer nada concreto.';

  try {
    const response = await getQwen().chat.completions.create({
      model: AI_AUTOMATION_MODEL,
      messages: [
        {
          role: 'system',
          content: `Eres la recepcionista IA de un despacho de abogados.

Redacta un unico mensaje breve, cercano y profesional para enviar al cliente.

Reglas obligatorias:
- Usa solo la informacion recibida.
- No uses plantillas ni frases mecanicas.
- No inventes datos.
- No incluyas firmas, nombres, telefonos, correos ni placeholders.
- Si el canal es email, puedes incluir un saludo breve y un cierre corto.
- Si el canal es whatsapp, ve mas directo y natural.
- Responde en el mismo idioma del cliente.
- Devuelve solo el texto final para el cliente.
/no_think`,
        },
        {
          role: 'user',
          content: `${options.historyContext ? `${options.historyContext}\n\n` : ''}CANAL: ${options.channel}
ASUNTO ORIGINAL: ${options.originalSubject}
MENSAJE ORIGINAL DEL CLIENTE:
${options.originalBody.substring(0, 2500)}

ULTIMO MENSAJE DEL CLIENTE:
${(options.latestCustomerText || '').substring(0, 1000)}

INSTRUCCION INTERNA:
${scenarioInstruction}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.25,
    });

    const text = stripThinkTags(response.choices?.[0]?.message?.content || '').trim();
    return text || null;
  } catch (err) {
    console.error('[generateOperationalClientReply] Error:', err);
    return null;
  }
}

async function ensurePendingEmailCase(
  accountId: string,
  account: any,
  email: IncomingEmail,
  conversationId: string,
  especialidadId: string | undefined,
): Promise<void> {
  if (await hasExistingCase(accountId, 'email', conversationId)) return;
  const { client } = await findOrCreateClient(accountId, email.from, '', email.fromName || email.from);
  await createCaseFromEmail(accountId, account, email, conversationId, especialidadId, 'solicitud_servicio', 'pending', undefined, undefined, client._id);
}

export function upsertPendingAssignmentConfirmation(
  account: any,
  entry: {
    originalFrom: string;
    originalFromName: string;
    originalSubject: string;
    originalBody: string;
    cuentaCorreoId: string;
    conversationId: string;
    especialidadId?: string;
    channel: 'email' | 'whatsapp';
    waContactPhone?: string;
    waConversationId?: string;
  },
): void {
  const pendingList = Array.isArray(account.pendingConsultas) ? account.pendingConsultas : [];
  const existingIndex = pendingList.findIndex((pending: any) =>
    pending.type === 'confirmacion_asignacion'
    && pending.channel === entry.channel
    && pending.conversationId === entry.conversationId
    && (entry.channel !== 'email' || pending.cuentaCorreoId === entry.cuentaCorreoId)
  );

  const pendingEntry = {
    id: existingIndex >= 0 ? pendingList[existingIndex].id : Date.now().toString(),
    originalFrom: entry.originalFrom,
    originalFromName: entry.originalFromName,
    originalSubject: entry.originalSubject,
    originalBody: entry.originalBody,
    cuentaCorreoId: entry.cuentaCorreoId,
    conversationId: entry.conversationId,
    forwardedAt: new Date().toISOString(),
    type: 'confirmacion_asignacion',
    especialidadId: entry.especialidadId,
    channel: entry.channel,
    waContactPhone: entry.waContactPhone,
    waConversationId: entry.waConversationId,
  };

  if (existingIndex >= 0) {
    pendingList[existingIndex] = pendingEntry;
  } else {
    pendingList.push(pendingEntry);
  }
  account.pendingConsultas = pendingList;
}

export function clearPendingAssignmentConfirmation(
  account: any,
  entry: {
    channel: 'email' | 'whatsapp';
    conversationId: string;
    cuentaCorreoId?: string;
  },
): void {
  const pendingList = Array.isArray(account.pendingConsultas) ? account.pendingConsultas : [];
  account.pendingConsultas = pendingList.filter((pending: any) => {
    if (pending.type !== 'confirmacion_asignacion') return true;
    if (pending.channel !== entry.channel) return true;
    if (pending.conversationId !== entry.conversationId) return true;
    if (entry.channel === 'email' && pending.cuentaCorreoId !== entry.cuentaCorreoId) return true;
    return false;
  });
}

async function assignCase(
  email: IncomingEmail,
  accountId: string,
  account: any,
  especialidadId: string | undefined,
  cuentaCorreo: CuentaCorreo,
  conversationId: string,
): Promise<void> {
  const subaccounts = await Subaccount.find({ parentAccountId: accountId });
  if (subaccounts.length === 0) {
    console.warn(`[assignCase] No subaccounts available for account ${accountId} â€” case for ${email.from} not assigned`);
    return;
  }

  let bestSubaccount: any = null;

  if (account.sortByCarga) {
    // Only by workload â€” ignore specialty (count only open clients)
    const clients = await Client.find({ accountId, status: 'abierto' });
    let minLoad = Infinity;
    for (const sub of subaccounts) {
      const load = clients.filter((c: any) => hasAssignedSubaccount(c, sub._id)).length;
      if (load < minLoad) { minLoad = load; bestSubaccount = sub; }
    }
  } else {
    // By specialty + workload
    const subs = account.subcuentaEspecialidades || {};
    const candidates = especialidadId
      ? subaccounts.filter((s: any) => subs[s._id] === especialidadId)
      : subaccounts;

    const pool = candidates.length > 0 ? candidates : subaccounts;
    const clients = await Client.find({ accountId, status: 'abierto' });
    let minLoad = Infinity;
    for (const sub of pool) {
      const load = clients.filter((c: any) => hasAssignedSubaccount(c, sub._id)).length;
      if (load < minLoad) { minLoad = load; bestSubaccount = sub; }
    }
  }

  if (!bestSubaccount) return;

  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  const espName = account.especialidades.find((e: any) => e.id === especialidadId)?.nombre || 'General';
  const lawyerName = bestSubaccount.name || bestSubaccount.email;

  // Generate AI summary
  const aiSummary = await generateCaseSummary(email, account, conversationId, espName, lawyerName);

  const { client, created } = await findOrCreateClient(
    accountId,
    email.from,
    '',
    email.fromName || email.from.split('@')[0],
    createAutomationClientId(),
  );
  if (conv) {
    conv.autoClientId = created ? client._id : undefined;
  }
  try {
    await saveAccount(account);
  } catch (err) {
    if (created) {
      await Client.deleteOne({ _id: client._id }).catch(() => {});
    }
    throw err;
  }
  await addSubaccountToClient(client._id, bestSubaccount._id);

  // Update the pending case to assigned status (or create if none exists)
  let updatedExisting = false;
  try {
    const CaseModel = (await import('../models/Case.js')).default;
    const updateResult = await CaseModel.findOneAndUpdate(
      { accountId, sourceId: conversationId, status: 'pending' },
      {
        status: 'assigned',
        assignedSubaccountId: bestSubaccount._id,
        assignedSubaccountName: bestSubaccount.name || bestSubaccount.email,
        assignedAt: new Date().toISOString(),
        linkedClientId: client._id,
        linkedClientName: email.fromName || email.from,
      }
    );
    if (updateResult) updatedExisting = true;
  } catch (err) {
    console.error('[assignCase] error updating case:', err);
  }

  if (!updatedExisting) {
    await createCaseFromEmail(accountId, account, email, conversationId, especialidadId, 'solicitud_servicio', 'assigned', bestSubaccount._id, bestSubaccount.name || bestSubaccount.email, client._id);
  }

  // Send email to the assigned lawyer
  const cuentaConfig = toCuentaConfig(cuentaCorreo);

  const lawyerNotification = `Nuevo cliente asignado automÃ¡ticamente.

DATOS DEL CLIENTE:
- Nombre: ${email.fromName || email.from}
- Email: ${email.from}
- Especialidad: ${espName}

RESUMEN DEL CASO:
${aiSummary}

---
Este cliente ha sido asignado a tu cuenta automÃ¡ticamente.`;

  try {
    await sendEmailViaCuenta(
      cuentaConfig,
      bestSubaccount.email,
      `[Nuevo cliente] ${email.fromName || email.from} â€” ${espName}`,
      lawyerNotification,
    );
  } catch (err) {
    console.error('Error enviando notificaciÃ³n al abogado:', err);
  }
}

// â”€â”€ Delayed reply queue (persisted in MongoDB) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface PendingReply {
  to: string;
  subject: string;
  text: string;
  messageId?: string;
  references?: string;
  scheduledAt: number; // timestamp
  accountId: string;
  conversationId?: string;
  cuentaCorreoId?: string;
  retryCount?: number;
}

async function scheduleReply(
  to: string,
  subject: string,
  text: string,
  messageId?: string,
  references?: string,
  accountId?: string,
  conversationId?: string,
  cuentaCorreoId?: string,
): Promise<void> {
  const delayMs = 1 * 60 * 1000; // 1 minuto
  const scheduledAt = Date.now() + delayMs;
  const replyDoc = {
    id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 8),
    to, subject, text, messageId, references,
    scheduledAt, accountId: accountId || '', conversationId, cuentaCorreoId,
    retryCount: 0,
  };
  await Automation.findByIdAndUpdate(accountId, { $push: { pendingReplies: replyDoc } });
}

async function processPendingReplies(): Promise<void> {
  const now = Date.now();
  // Find all accounts with due pending replies
  const accounts = await Automation.find({ 'pendingReplies.scheduledAt': { $lte: now } });
  if (accounts.length === 0) return;

  for (const account of accounts) {
    const due = (account.pendingReplies || []).filter((r: any) => r.scheduledAt <= now);
    if (due.length === 0) continue;

    const sentIds: string[] = [];

    const MAX_RETRIES = 5;

    for (const reply of due) {
      try {
        // Drop replies that exceeded max retries
        if ((reply.retryCount || 0) >= MAX_RETRIES) {
          console.error(`[scheduleReply] Reply to ${reply.to} exceeded ${MAX_RETRIES} retries, keeping queued for manual review`);
          continue;
        }

        // Resolve only the original sender account; never fall back to another mailbox.
        const cuentaCorreo = findCuentaCorreoExact(account, reply.cuentaCorreoId)
          || (!reply.cuentaCorreoId ? getConversationCuentaCorreo(account, reply.conversationId) : null);
        if (!cuentaCorreo) {
          console.error(`[scheduleReply] Original email account not found for ${account._id}, keeping queued reply to ${reply.to}`);
          await Automation.findByIdAndUpdate(account._id, {
            $inc: { 'pendingReplies.$[elem].retryCount': 1 }
          }, { arrayFilters: [{ 'elem.id': reply.id }] });
          continue;
        }
        const cuentaConfig = toCuentaConfig(cuentaCorreo);
        await replyToEmail(cuentaConfig, reply.to, reply.subject, reply.text, reply.messageId, reply.references);
        sentIds.push(reply.id);

        // Update conversation with the reply message
        if (reply.accountId && reply.conversationId) {
          await withAccountLock(reply.accountId, async () => {
            const freshAccount = await getAccount(reply.accountId);
            const conv = freshAccount.emailConversations.find((c: any) => c.id === reply.conversationId);
            if (conv) {
              const timeStr = new Date().toISOString();
              conv.messages.push({
                id: Date.now().toString(),
                from: 'Asistente',
                text: reply.text,
                time: timeStr,
                sent: true,
              });
              conv.lastMessageTime = new Date().toISOString();
              await saveAccount(freshAccount);
            }
          });
        }
      } catch (err) {
        console.error(`[scheduleReply] Error sending to ${reply.to} (attempt ${(reply.retryCount || 0) + 1}/${MAX_RETRIES}):`, err);
        // Increment retry counter; reply stays in queue for next cycle
        await Automation.findByIdAndUpdate(account._id, {
          $inc: { 'pendingReplies.$[elem].retryCount': 1 }
        }, { arrayFilters: [{ 'elem.id': reply.id }] });
      }
    }

    // Only remove successfully sent replies
    if (sentIds.length > 0) {
      await Automation.findByIdAndUpdate(account._id, {
        $pull: { pendingReplies: { id: { $in: sentIds } } }
      });
    }
  }
}

// Start processing pending replies every 30 seconds
setInterval(() => {
  processPendingReplies().catch(err =>
    console.error('[scheduleReply] Error processing queue:', err)
  );
}, 30 * 1000);

// â”€â”€ Save incoming email attachments to disk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function saveIncomingAttachments(attachments?: IncomingEmailAttachment[]): Array<{ id: string; filename: string; originalName: string; mimeType: string; size: number }> {
  if (!attachments || attachments.length === 0) return [];
  const saved: Array<{ id: string; filename: string; originalName: string; mimeType: string; size: number }> = [];
  for (const att of attachments) {
    const id = Date.now().toString() + '_' + Math.random().toString(36).substring(2, 8);
    const diskFilename = `${Date.now()}_${sanitizeFilename(att.filename)}`;
    const filePath = path.join(EMAIL_ATTACHMENTS_DIR, diskFilename);
    fs.writeFileSync(filePath, att.content);
    saved.push({ id, filename: diskFilename, originalName: sanitizeFilename(att.filename), mimeType: att.mimeType, size: att.size });
  }
  return saved;
}

// â”€â”€ 6. Add/update email conversation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function addToConversation(
  account: any,
  email: IncomingEmail,
  cuentaCorreo: CuentaCorreo,
  isReply: boolean,
  replyText?: string,
  classificationType?: 'consulta_general' | 'solicitud_servicio' | 'otro',
): string {
  // Find existing conversation with this contact
  let conv = findEmailConversation(account, email.from, cuentaCorreo.id);

  const now = new Date();
  const timeStr = now.toISOString();

  // Save incoming attachments to disk
  const savedAttachments = saveIncomingAttachments(email.attachments);

  const cleanBody = stripQuotedText(email.body);

  if (!conv) {
    const incomingMsg: any = {
      id: Date.now().toString(),
      from: email.fromName || email.from,
      text: cleanBody.substring(0, 5000),
      time: timeStr,
      sent: false,
      messageId: email.messageId,
      references: email.references,
      inReplyTo: email.inReplyTo,
      attachments: savedAttachments,
    };
    const msgs: any[] = [incomingMsg];

    if (isReply && replyText) {
      msgs.push({
        id: (Date.now() + 1).toString(),
        from: 'Asistente',
        text: replyText,
        time: timeStr,
        sent: true,
        attachments: [],
      });
    }

    const newConv = {
      id: Date.now().toString(),
      contactName: email.fromName || email.from,
      contactEmail: email.from,
      subject: email.subject,
      messages: msgs,
      lastMessageTime: now.toISOString(),
      unread: 1,
      cuentaCorreoId: cuentaCorreo.id,
      cuentaCorreoEmail: cuentaCorreo.correo,
      classificationType,
    };
    account.emailConversations.push(newConv);
    return newConv.id;
  }

  rememberConversationCuentaCorreo(conv, cuentaCorreo);

  // Add incoming message to existing conversation
  conv.messages.push({
    id: Date.now().toString(),
    from: email.fromName || email.from,
    text: cleanBody.substring(0, 5000),
    time: timeStr,
    sent: false,
    messageId: email.messageId,
    references: email.references,
    inReplyTo: email.inReplyTo,
    attachments: savedAttachments,
  });
  conv.unread++;
  conv.lastMessageTime = now.toISOString();
  if (classificationType) {
    conv.classificationType = classificationType;
  }

  // Add auto-reply if provided
  if (isReply && replyText) {
    conv.messages.push({
      id: (Date.now() + 1).toString(),
      from: 'Asistente',
      text: replyText,
      time: timeStr,
      sent: true,
      attachments: [],
    });
  }

  return conv.id;
}

// â”€â”€ Apply classify rules to a newly stored conversation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function applyClassifyRules(
  account: any,
  conversationId: string,
  emailSubject: string,
  emailBody: string,
): Promise<void> {
  const rules: Array<{ id: string; name: string; description: string; folderIds: string[] }> = account.emailClassifyRules || [];
  if (rules.length === 0) return;
  const folders: Array<{ id: string; name: string; conversationIds: string[] }> = account.emailFolders || [];
  if (folders.length === 0) return;

  let modified = false;
  for (const rule of rules) {
    const targetFolderIds = rule.folderIds.filter((fid: string) => folders.some((f: any) => f.id === fid));
    if (targetFolderIds.length === 0) continue;
    const folderNames = targetFolderIds.map((fid: string) => folders.find((f: any) => f.id === fid)?.name || fid).join(', ');
    const prompt = `Tienes una regla de clasificaciÃ³n de emails:\nNombre: "${rule.name}"\nDescripciÃ³n: "${rule.description}"\nCarpetas destino: "${folderNames}"\n\nAnaliza este email y determina si debe clasificarse segÃºn esa regla:\nASUNTO: ${emailSubject}\nCONTENIDO:\n${emailBody.substring(0, 2000)}\n\nResponde SOLO con JSON: {"match": true} o {"match": false}\n/no_think`;
    try {
      const response = await getQwen().chat.completions.create({
        model: AI_AUTOMATION_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.1,
      });
      const text = stripThinkTags(response.choices[0]?.message?.content || '').trim();
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (!jsonMatch) continue;
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.match !== true) continue;
    } catch (err) {
      console.error('[applyClassifyRules] Error en regla', rule.id, err);
      continue;
    }
    for (const folderId of targetFolderIds) {
      const folder = account.emailFolders.find((f: any) => f.id === folderId);
      const folderKey = getEmailConversationFolderKey(conversationId);
      if (folder && !folder.conversationIds.includes(folderKey)) {
        folder.conversationIds = (folder.conversationIds || []).filter((cid: string) => cid !== conversationId);
        folder.conversationIds.push(folderKey);
        modified = true;
      }
    }
  }
  if (modified) await saveAccount(account);
}

// â”€â”€ Main pipeline â€” process one incoming email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function processOneEmailUnified(
  email: IncomingEmail,
  accountId: string,
  cuentaCorreo: CuentaCorreo,
): Promise<void> {
  const account = await getAccount(accountId);
  const cuentaConfig = toCuentaConfig(cuentaCorreo);
  const fromLower = email.from.toLowerCase();
  const consultaEmails = getUnifiedConsultaEmails(account);
  const isConsulta = consultaEmails.some((c: any) => c.toLowerCase() === fromLower)
    || email.subject.includes('[Consulta pendiente]');
  if (isConsulta) {
    const handled = await processConsultaReply(email, accountId, cuentaCorreo);
    if (handled) return;
  }

  const existingConv = findEmailConversation(account, email.from, cuentaCorreo.id);
  const contactoConocido = (account.emailConversations || []).some((conversation: any) =>
    normalizeEmailAddress(conversation.contactEmail) === fromLower,
  );

  if (existingConv?.autoReplyPaused) {
    const convIdPaused = addToConversation(account, email, cuentaCorreo, false);
    await saveAccount(account);
    await applyClassifyRules(account, convIdPaused, email.subject, email.body);
    return;
  }

  if (email.attachments && email.attachments.length > 0 && account.switchActivo) {
    const convIdWithAttachments = addToConversation(account, email, cuentaCorreo, false);
    await saveAccount(account);
    await applyClassifyRules(account, convIdWithAttachments, email.subject, email.body);
    if (account.correosConsultas.length > 0) {
      await forwardToConsultas(cuentaConfig, account.correosConsultas, email, account, cuentaCorreo.id, convIdWithAttachments);
    }
    return;
  }

  const convId = addToConversation(account, email, cuentaCorreo, false);
  await saveAccount(account);

  const latestConv = account.emailConversations.find((conversation: any) => conversation.id === convId) || existingConv;
  const assignableCandidates = await listAssignableCandidates(accountId);
  const decision = await runCustomerAutomationEngine({
    workspaceId: accountId,
    canalEntrada: 'email',
    contactoConocido,
    responseAutomaticaActiva: account.switchActivo === true,
    toggles: {
      respondConsultasGenerales: account.respondConsultasGenerales !== false,
      respondSolicitudesServicio: account.respondSolicitudesServicio !== false,
      soloContactosConocidos: account.soloContactosConocidos === true,
      autoAssignEnabled: account.autoAssignEnabled === true,
      sortByCarga: account.sortByCarga === true,
    },
    restricciones: {
      soloResponderMismoCanal: true,
    },
    especialidades: (account.especialidades || []).map((item: any) => ({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion || '',
    })),
    cuentasCandidatas: assignableCandidates.map((candidate) => ({
      id: candidate.id,
      nombre: candidate.name,
      email: candidate.email,
      cargaActual: candidate.load,
    })),
    carpetas: getEmailFolderDescriptions(account),
    reglasOrganizacion: (account.emailClassifyRules || []).map((rule: any) => ({
      id: rule.id,
      nombre: rule.name,
      descripcion: rule.description || '',
      folderIds: rule.folderIds || [],
    })),
    correoConsultas: {
      destino: consultaEmails,
      cuentaOperativa: (account.cuentasCorreo || []).map((item: any) => item.correo).filter(Boolean),
    },
    documentos: (account.documentos || []).map((doc: any) => ({
      nombre: doc.nombre,
      texto: doc.extractedText || '',
    })),
    ultimos20Mensajes: buildEmailEngineMessages(
      (latestConv?.messages || []).slice(0, -1),
      latestConv?.contactName || email.from,
      email,
    ),
  });

  if (!decision.valida) {
    return;
  }

  const storedConversation = account.emailConversations.find((conversation: any) => conversation.id === convId);
  if (storedConversation) {
    if (decision.createPendingCase || decision.askAssignment || decision.assignCase || decision.specialtyId) {
      storedConversation.classificationType = 'solicitud_servicio';
    } else if (
      decision.noResponder
      && !decision.mensajeCliente
      && !decision.consultasMessage
      && !decision.pauseAutoReply
      && decision.folderIds.length === 0
    ) {
      storedConversation.classificationType = 'otro';
    } else {
      storedConversation.classificationType = 'consulta_general';
    }
    await saveAccount(account);
  }

  await assignEmailConversationToFolders(account, convId, decision.folderIds);

  if (decision.askAssignment) {
    upsertPendingAssignmentConfirmation(account, {
      originalFrom: email.from,
      originalFromName: email.fromName,
      originalSubject: email.subject,
      originalBody: stripQuotedText(email.body),
      cuentaCorreoId: cuentaCorreo.id,
      conversationId: convId,
      especialidadId: decision.specialtyId,
      channel: 'email',
    });
  } else {
    clearPendingAssignmentConfirmation(account, {
      channel: 'email',
      conversationId: convId,
      cuentaCorreoId: cuentaCorreo.id,
    });
  }

  if (decision.createPendingCase || decision.askAssignment || decision.assignCase) {
    await ensurePendingEmailCase(accountId, account, email, convId, decision.specialtyId);
  }

  await saveAccount(account);

  if (decision.consultasMessage) {
    await forwardToConsultas(
      cuentaConfig,
      consultaEmails,
      email,
      account,
      cuentaCorreo.id,
      convId,
      (decision.createPendingCase || decision.askAssignment || decision.assignCase || !!decision.specialtyId) ? 'solicitud_sin_especialista' : 'consulta_general',
      undefined,
      decision.specialtyId,
      decision.consultasMessage,
    );
    return;
  }

  if (decision.pauseAutoReply) {
    const conversation = account.emailConversations.find((item: any) => item.id === convId);
    if (conversation) {
      conversation.autoReplyPaused = true;
      await saveAccount(account);
    }
  }

  if (decision.assignCase) {
    const assigned = await assignCaseToCandidateId(
      email,
      accountId,
      account,
      decision.assignTo!,
      cuentaCorreo,
      convId,
      decision.specialtyId,
    );
    if (!assigned) {
      return;
    }
  }

  if (decision.askAssignment) {
    if (!decision.mensajeCliente) {
      return;
    }
    await scheduleReply(
      email.from,
      email.subject,
      decision.mensajeCliente,
      email.messageId,
      email.references,
      accountId,
      convId,
      cuentaCorreo.id,
    );
    await saveAccount(account);
    return;
  }

  if (!decision.mensajeCliente || decision.noResponder) {
    return;
  }

  await scheduleReply(
    email.from,
    email.subject,
    decision.mensajeCliente,
    email.messageId,
    email.references,
    accountId,
    convId,
    cuentaCorreo.id,
  );
}

// â”€â”€ Polling management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();
const EMAIL_POLL_LOCK_TTL_MS = 5 * 60 * 1000;

export async function processIncomingEmails(accountId: string): Promise<number> {
  const processed = await runWithDistributedLock(`email-poll:${accountId}`, EMAIL_POLL_LOCK_TTL_MS, async () =>
    withAccountLock(accountId, async () => {
      const account = await getAccount(accountId);

      let totalProcessed = 0;

    for (const cuentaCorreo of account.cuentasCorreo) {
      const cuentaConfig = toCuentaConfig(cuentaCorreo);

      try {
        const emails = await fetchUnreadEmails(cuentaConfig);

        // Group emails by sender to avoid multiple replies to the same contact
        const emailsBySender = new Map<string, typeof emails>();
        for (const email of emails) {
          const key = email.from.toLowerCase();
          const group = emailsBySender.get(key) || [];
          group.push(email);
          emailsBySender.set(key, group);
        }

        for (const [, senderEmails] of emailsBySender) {
          try {
            // Sort by date ascending so we process in order
            senderEmails.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

            if (!account.switchActivo) {
              // Just store all messages
              for (const email of senderEmails) {
                addToConversation(account, email, cuentaCorreo, false);
                await saveAccount(account);
                if (email.uid) {
                  await markEmailsAsSeen(cuentaConfig, [email.uid]);
                }
              }
              totalProcessed += senderEmails.length;
              continue;
            }

            if (senderEmails.length === 1) {
              // Single email â€” process normally
              await processOneEmailUnified(senderEmails[0], accountId, cuentaCorreo);
              if (senderEmails[0].uid) {
                await markEmailsAsSeen(cuentaConfig, [senderEmails[0].uid]);
              }
            } else {
              // Multiple emails from same sender â€” store all, but only AI-process the merged version
              // Store all individual messages in the conversation first
              for (let i = 0; i < senderEmails.length - 1; i++) {
                addToConversation(account, senderEmails[i], cuentaCorreo, false);
              }
              await saveAccount(account);
              const persistedUids = senderEmails
                .slice(0, -1)
                .map((email) => email.uid)
                .filter((uid): uid is number => Number.isInteger(uid));
              if (persistedUids.length > 0) {
                await markEmailsAsSeen(cuentaConfig, persistedUids);
              }

              // Merge bodies into the last email for AI processing
              const lastEmail = senderEmails[senderEmails.length - 1];
              const mergedBody = senderEmails.map(e => e.body).join('\n\n---\n\n');
              const mergedEmail: IncomingEmail = {
                ...lastEmail,
                body: mergedBody.substring(0, 10000),
                // Merge attachments from all emails
                attachments: senderEmails.flatMap(e => e.attachments || []),
              };
              await processOneEmailUnified(mergedEmail, accountId, cuentaCorreo);
              if (lastEmail.uid) {
                await markEmailsAsSeen(cuentaConfig, [lastEmail.uid]);
              }
            }
            totalProcessed += senderEmails.length;
          } catch (err) {
            console.error(`Error procesando emails de ${senderEmails[0]?.from}:`, err);
          }
        }
      } catch (err) {
        console.error(`Error fetching emails de ${cuentaCorreo.correo}:`, err);
      }
    }

      return totalProcessed;
    })
  );

  return processed ?? 0;
}

export function startPolling(accountId: string): void {
  if (pollingIntervals.has(accountId)) return;


  // Run immediately once
  processIncomingEmails(accountId).catch(console.error);

  // Then every 1 minute
  const interval = setInterval(() => {
    processIncomingEmails(accountId).catch(console.error);
  }, 1 * 60 * 1000);

  pollingIntervals.set(accountId, interval);
}

export function stopPolling(accountId: string): void {
  const interval = pollingIntervals.get(accountId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(accountId);
  }
}

export function isPollingActive(accountId: string): boolean {
  return pollingIntervals.has(accountId);
}

// â”€â”€ Get conversations for frontend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getEmailConversations(accountId: string): Promise<EmailConversation[]> {
  const account = await getAccount(accountId);
  return account.emailConversations || [];
}

// â”€â”€ Get pending consultas for frontend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getPendingConsultas(accountId: string): Promise<PendingConsulta[]> {
  const account = await getAccount(accountId);
  return account.pendingConsultas || [];
}

// â”€â”€ Mark conversation as read â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function markConversationRead(accountId: string, conversationId: string): Promise<void> {
  const account = await getAccount(accountId);
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (conv && conv.unread > 0) {
    conv.unread = 0;
    await saveAccount(account);
  }
}

// â”€â”€ Delete conversation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function deleteConversation(accountId: string, conversationId: string): Promise<void> {
  const account = await getAccount(accountId);

  // Find the conversation before deleting (to get autoClientId)
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);

  // Remove the conversation
  account.emailConversations = account.emailConversations.filter((c: any) => c.id !== conversationId);

  // Remove related pendingConsultas
  const beforePending = account.pendingConsultas.length;
  account.pendingConsultas = account.pendingConsultas.filter((p: any) => p.conversationId !== conversationId);
  const removedPending = beforePending - account.pendingConsultas.length;
  if (removedPending > 0) {
  }

  await saveAccount(account);

  // Remove auto-created client if exists
  if (conv?.autoClientId) {
    try {
      const result = await Client.deleteOne({ _id: conv.autoClientId, accountId, autoCreated: true });
      if (result.deletedCount > 0) {
      }
    } catch (err) {
      console.error('[Email] Error deleting auto-created client:', err);
    }
  }
}

// â”€â”€ Toggle auto-reply for individual conversation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function toggleConversationAutoReply(accountId: string, conversationId: string, paused: boolean): Promise<boolean> {
  const account = await getAccount(accountId);
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (!conv) return false;
  conv.autoReplyPaused = paused;
  await saveAccount(account);
  return true;
}

// â”€â”€ Send manual email from a conversation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function sendManualEmail(
  accountId: string,
  conversationId: string,
  text: string,
  attachmentFiles?: Array<{ id: string; filename: string; originalName: string; mimeType: string; size: number; path: string }>,
): Promise<{ ok: boolean; error?: string; notFound?: boolean }> {
  const account = await getAccount(accountId);
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (!conv) return { ok: false, error: 'ConversaciÃ³n no encontrada', notFound: true };

  // Find the email account to send from
  const cuentaCorreo = getConversationCuentaCorreo(account, conversationId) || getDefaultCuentaCorreo(account);
  if (!cuentaCorreo) return { ok: false, error: 'Cuenta de correo no encontrada', notFound: true };

  const cuentaConfig = toCuentaConfig(cuentaCorreo);

  // Save message BEFORE sending so it's not lost if SMTP succeeds but save fails
  const timeStr = new Date().toISOString();
  const msgAttachments = attachmentFiles?.map(a => ({
    id: a.id,
    filename: a.filename,
    originalName: a.originalName,
    mimeType: a.mimeType,
    size: a.size,
  }));
  const newMsg: any = {
    id: Date.now().toString(),
    from: 'Asistente',
    text,
    time: timeStr,
    sent: true,
    attachments: msgAttachments || [],
  };
  conv.messages.push(newMsg);
  conv.lastMessageTime = new Date().toISOString();
  await saveAccount(account);

  try {
    const replySource = [...(conv.messages || [])].reverse().find((message: any) => !message.sent && (message.messageId || message.references));
    const inReplyTo = replySource?.messageId;
    const references = [replySource?.references, replySource?.messageId].filter(Boolean).join(' ') || undefined;
    const smtpAttachments = attachmentFiles?.map(a => ({ filename: a.originalName, path: a.path }));
    const sentMessageId = await replyToEmail(cuentaConfig, conv.contactEmail, conv.subject, text, inReplyTo, references, smtpAttachments);
    newMsg.messageId = sentMessageId;
    newMsg.references = references;
    newMsg.inReplyTo = inReplyTo;
    await saveAccount(account);

    return { ok: true };
  } catch (err) {
    console.error('[Email] Error sending manual email, rolling back message:', err);
    // Rollback: remove message from conversation
    const idx = conv.messages.findIndex((m: any) => m.id === newMsg.id);
    if (idx >= 0) conv.messages.splice(idx, 1);
    await saveAccount(account);
    // Cleanup orphaned attachment files on disk
    if (attachmentFiles) {
      for (const af of attachmentFiles) {
        try { const fs = await import('fs'); fs.unlinkSync(af.path); } catch { /* already gone */ }
      }
    }
    return { ok: false, error: 'Error al enviar el email por SMTP' };
  }
}

// â”€â”€ Resume polling for all active accounts on server startup â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function resumeAllPolling(): Promise<void> {
  try {
    // Resume polling for all accounts that have email accounts configured (fetch always, AI only when switchActivo)
    const allDocs = await Automation.find({ 'cuentasCorreo.0': { $exists: true } });
    for (const doc of allDocs) {
      startPolling(doc._id);
    }
  } catch (err) {
    console.error('[Email] Error resuming polling on startup:', err);
  }
}
