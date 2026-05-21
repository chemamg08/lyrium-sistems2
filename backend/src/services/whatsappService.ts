import OpenAI from 'openai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AI_AUTOMATION_MODEL } from '../config/aiModel.js';
import { stripThinkTags } from './aiService.js';
import { Automation } from '../models/Automation.js';
import { sendEmail, sendEmailViaCuenta, type CuentaCorreoConfig } from './emailService.js';
import { getAutomationMessage, resolveAutomationLanguage } from './automationMessages.js';
import { runCustomerAutomationEngine } from './customerAutomationEngine.js';
import { listAssignableCandidates } from './automationWorkspaceService.js';
import {
  assignWhatsAppCase,
  assignWhatsAppCaseToCandidateId,
  decryptPassword,
  detectExplicitAssignmentRequest,
  encryptPassword,
  hasMatchingSpecialist,
  interpretClientConfirmation,
  upsertPendingAssignmentConfirmation,
} from './emailProcessorService.js';
import { createCaseFromWhatsApp } from './casesService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getBackendPublicUrl(): string {
  const value = stripTrailingSlash(String(process.env.BACKEND_PUBLIC_URL || '').trim());
  if (!/^https?:\/\//i.test(value)) {
    throw new Error('BACKEND_PUBLIC_URL no configurado o inválido');
  }
  return value;
}

const META_API_VERSION = process.env.WHATSAPP_META_API_VERSION || 'v22.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const WA_ATTACHMENTS_DIR = path.join(__dirname, '../../uploads/wa-attachments');
const WA_PUBLIC_ATTACHMENT_TTL_MS = 15 * 60 * 1000;
const WA_CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;

if (!fs.existsSync(WA_ATTACHMENTS_DIR)) fs.mkdirSync(WA_ATTACHMENTS_DIR, { recursive: true });

// ── Per-account lock to avoid race conditions ────────────────────────
const accountLocks = new Map<string, Promise<void>>();
function withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  const prev = accountLocks.get(accountId) || Promise.resolve();
  const next = prev.then(fn, fn);
  accountLocks.set(accountId, next.then(() => {}, () => {}));
  return next;
}

// ── AI client ─────────────────────────────────────────────────────────
let _ai: OpenAI | null = null;
function getAI(): OpenAI {
  if (!_ai) {
    _ai = new OpenAI({
      apiKey: process.env.ATLAS_API_KEY,
      baseURL: 'https://api.atlascloud.ai/v1',
    });
  }
  return _ai;
}

function getMetaAppId(): string {
  const v = process.env.WHATSAPP_META_APP_ID || '';
  if (!v) throw new Error('WHATSAPP_META_APP_ID no configurado');
  return v;
}

function getMetaAppSecret(): string {
  const v = process.env.WHATSAPP_META_APP_SECRET || '';
  if (!v) throw new Error('WHATSAPP_META_APP_SECRET no configurado');
  return v;
}

function getMetaRedirectUri(): string {
  return process.env.WHATSAPP_META_REDIRECT_URI || `${getBackendPublicUrl()}/api/whatsapp/meta/callback`;
}

function accountIdFromInstanceName(instanceName: string): string {
  return instanceName.startsWith('lyrium_') ? instanceName.slice('lyrium_'.length) : instanceName;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function createAutomationClientId(): string {
  return `client_${crypto.randomUUID()}`;
}

interface FindOrCreateClientResult {
  client: any;
  created: boolean;
}

async function findOrCreateClient(
  accountId: string,
  email: undefined,
  phone: string,
  name: string,
  preferredId?: string,
): Promise<FindOrCreateClientResult> {
  const Client = (await import('../models/Client.js')).Client;

  const normalizedPhone = normalizePhone(phone);

  let existingClient = await Client.findOne({
    accountId,
    phone: { $regex: new RegExp(`^${normalizedPhone}$`, 'i') },
  });

  if (existingClient) {
    await Client.findByIdAndUpdate(existingClient._id, {
      $inc: { cases: 1 },
    });
    return { client: existingClient, created: false };
  }

  const newClient = await Client.create({
    _id: preferredId || createAutomationClientId(),
    accountId,
    name: name || phone,
    email: '',
    phone: phone,
    status: 'abierto',
    cases: 1,
    autoCreated: true,
  });

  return { client: newClient, created: true };
}

function sanitizePhone(phone: string): string {
  return (phone || '').replace(/[^0-9]/g, '');
}

async function graphFetchJson<T = any>(
  endpoint: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${META_GRAPH_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Meta Graph ${endpoint} failed (${res.status}): ${txt}`);
  }

  return res.json() as Promise<T>;
}

async function graphFetchBuffer(url: string, token: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Meta media download failed (${res.status}): ${txt}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function fetchAccessibleWhatsAppBusinesses(accessToken: string): Promise<any[]> {
  const wabas: any[] = [];
  const seen = new Set<string>();

  try {
    const directResp = await graphFetchJson<any>('/me/whatsapp_business_accounts', accessToken);
    for (const entry of Array.isArray(directResp?.data) ? directResp.data : []) {
      if (entry?.id && !seen.has(entry.id)) {
        seen.add(entry.id);
        wabas.push(entry);
      }
    }
  } catch {
    // User tokens from FB.login often fail here; fallback below.
  }

  if (wabas.length > 0) return wabas;

  const bizResp = await graphFetchJson<any>('/me/businesses', accessToken);
  const businesses: any[] = Array.isArray(bizResp?.data) ? bizResp.data : [];
  for (const biz of businesses) {
    try {
      const bwabaResp = await graphFetchJson<any>(`/${biz.id}/whatsapp_business_accounts`, accessToken);
      for (const entry of Array.isArray(bwabaResp?.data) ? bwabaResp.data : []) {
        if (entry?.id && !seen.has(entry.id)) {
          seen.add(entry.id);
          wabas.push(entry);
        }
      }
    } catch {
      // Try next business.
    }
  }

  return wabas;
}

async function resolveSingleMetaWaba(accessToken: string): Promise<any> {
  const wabas = await fetchAccessibleWhatsAppBusinesses(accessToken);
  if (wabas.length === 0) {
    throw new Error('No se encontró ninguna cuenta de WhatsApp Business en Meta. Asegúrate de que tu cuenta de Meta tiene una cuenta de WhatsApp Business vinculada.');
  }
  if (wabas.length > 1) {
    throw new Error('Meta devolvió varias cuentas de WhatsApp Business. Usa la conexión manual indicando WABA ID y Phone Number ID para evitar enlazar el número equivocado.');
  }
  return wabas[0];
}

async function resolveSingleMetaPhone(accessToken: string, wabaId: string): Promise<any> {
  const phoneResp = await graphFetchJson<any>(`/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, accessToken);
  const phones = Array.isArray(phoneResp?.data) ? phoneResp.data : [];
  if (phones.length === 0) {
    throw new Error('No se encontró ningún número en la cuenta de WhatsApp Business');
  }
  if (phones.length > 1) {
    throw new Error('Meta devolvió varios números de WhatsApp para esta cuenta. Usa la conexión manual indicando Phone Number ID para evitar enlazar el número equivocado.');
  }
  return phones[0];
}

async function inspectMetaToken(accessToken: string): Promise<{ tokenExpiresAt?: string; tokenType?: 'short' | 'long' }> {
  try {
    const appAccessToken = `${getMetaAppId()}|${getMetaAppSecret()}`;
    const debugUrl = new URL(`${META_GRAPH_BASE}/debug_token`);
    debugUrl.searchParams.set('input_token', accessToken);
    debugUrl.searchParams.set('access_token', appAccessToken);

    const res = await fetch(debugUrl.toString());
    if (!res.ok) return {};

    const data = await res.json().catch(() => ({}));
    const expiresAtUnix = Number(data?.data?.expires_at || 0);
    if (!Number.isFinite(expiresAtUnix) || expiresAtUnix <= 0) return {};

    const tokenExpiresAt = new Date(expiresAtUnix * 1000).toISOString();
    const remainingMs = expiresAtUnix * 1000 - Date.now();
    return {
      tokenExpiresAt,
      tokenType: remainingMs > 24 * 60 * 60 * 1000 ? 'long' : 'short',
    };
  } catch {
    return {};
  }
}

type WhatsAppConnectionStatus = 'ok' | 'warning' | 'expired' | 'error' | 'disconnected';

interface WhatsAppValidationResult {
  connected: boolean;
  connectionStatus: WhatsAppConnectionStatus;
  phoneNumber?: string;
  tokenExpiresAt?: string;
  expiryKnown: boolean;
  lastValidationError?: string;
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function getDaysRemaining(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return null;
  return Math.floor((expires - Date.now()) / (1000 * 60 * 60 * 24));
}

function deriveConnectionStatus(expiresAt?: string, expiryKnown = false): WhatsAppConnectionStatus {
  if (!expiryKnown || !expiresAt) return 'ok';
  const daysRemaining = getDaysRemaining(expiresAt);
  if (daysRemaining === null) return 'ok';
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= 7) return 'warning';
  return 'ok';
}

function ensureWhatsAppSessions(account: any): any[] {
  if (!Array.isArray(account.whatsappSessions)) {
    account.whatsappSessions = [];
  }
  return account.whatsappSessions;
}

function syncLegacyWhatsAppSession(account: any): void {
  const sessions = ensureWhatsAppSessions(account);
  const connectedSession = sessions.find((session: any) => session.connected);
  account.whatsappSession = connectedSession || null;
}

function upsertWhatsAppSession(account: any, phoneNumberId: string, patch: Record<string, any>): any {
  const sessions = ensureWhatsAppSessions(account);
  const existingSession = sessions.find((session: any) => session.phoneNumberId === phoneNumberId);

  if (existingSession) {
    Object.assign(existingSession, patch);
    syncLegacyWhatsAppSession(account);
    return existingSession;
  }

  const nextSession = {
    provider: 'meta',
    connected: false,
    expiryKnown: false,
    connectionStatus: 'disconnected',
    ...patch,
  };
  sessions.push(nextSession);
  syncLegacyWhatsAppSession(account);
  return nextSession;
}

async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<string> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  const llUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  llUrl.searchParams.set('grant_type', 'fb_exchange_token');
  llUrl.searchParams.set('client_id', appId);
  llUrl.searchParams.set('client_secret', appSecret);
  llUrl.searchParams.set('fb_exchange_token', shortLivedToken);

  const llRes = await fetch(llUrl.toString());
  const llData = await llRes.json().catch(() => ({}));
  if (!llRes.ok || !llData?.access_token) {
    const details = llData?.error?.message || JSON.stringify(llData || {});
    throw new Error(`No se pudo intercambiar el token temporal por uno long-lived: ${details}`);
  }

  return String(llData.access_token);
}

function normalizeTokenMetadata(
  tokenMetadata: { tokenExpiresAt?: string; tokenType?: 'short' | 'long' },
  fallbackTokenType: string,
): { tokenExpiresAt?: string; expiryKnown: boolean; tokenType: string } {
  return {
    tokenExpiresAt: tokenMetadata.tokenExpiresAt,
    expiryKnown: !!tokenMetadata.tokenExpiresAt,
    tokenType: tokenMetadata.tokenType || fallbackTokenType,
  };
}

export async function validateWhatsAppSession(accountId: string, phoneNumberId: string): Promise<WhatsAppValidationResult> {
  const account = await Automation.findById(accountId);
  if (!account) {
    return {
      connected: false,
      connectionStatus: 'disconnected',
      expiryKnown: false,
      lastValidationError: 'Cuenta no encontrada',
    };
  }

  const session = resolveWhatsAppSession(account, phoneNumberId);
  if (!session?.phoneNumberId) {
    return {
      connected: false,
      connectionStatus: 'disconnected',
      expiryKnown: false,
      lastValidationError: 'Sesion no encontrada',
    };
  }

  const token = getSessionToken(account, session);
  if (!token) {
    return {
      connected: false,
      connectionStatus: 'error',
      expiryKnown: !!session.tokenExpiresAt,
      tokenExpiresAt: session.tokenExpiresAt,
      lastValidationError: 'Token Meta invalido',
    };
  }

  try {
    const [tokenMetadata, phoneData] = await Promise.all([
      inspectMetaToken(token),
      graphFetchJson<any>(`/${session.phoneNumberId}?fields=id,display_phone_number,whatsapp_business_account`, token),
    ]);

    const phoneNumber = phoneData?.display_phone_number || session.phoneNumber || '';
    const tokenInfo = normalizeTokenMetadata(tokenMetadata, session.tokenType || 'unknown');
    const connectionStatus = deriveConnectionStatus(tokenInfo.tokenExpiresAt || session.tokenExpiresAt, tokenInfo.expiryKnown || !!session.expiryKnown);

    return {
      connected: true,
      connectionStatus,
      phoneNumber,
      tokenExpiresAt: tokenInfo.tokenExpiresAt,
      expiryKnown: tokenInfo.expiryKnown || !!session.expiryKnown,
    };
  } catch (err: any) {
    const message = String(err?.message || 'Error validando la sesion de WhatsApp');
    const lower = message.toLowerCase();
    const disconnected = /invalid|expired|revoked|permission|unauthor|phone number|unsupported|get \(400\)|get \(401\)|get \(403\)/i.test(message);
    return {
      connected: false,
      connectionStatus: disconnected ? 'error' : 'disconnected',
      tokenExpiresAt: session.tokenExpiresAt,
      expiryKnown: !!session.expiryKnown,
      lastValidationError: lower.includes('expired') ? 'Token expirado o invalido' : message,
    };
  }
}

export async function syncWhatsAppSessionValidation(accountId: string, phoneNumberId: string): Promise<WhatsAppValidationResult | null> {
  const account = await Automation.findById(accountId);
  if (!account) return null;

  const session = resolveWhatsAppSession(account, phoneNumberId);
  if (!session?.phoneNumberId) return null;

  const validation = await validateWhatsAppSession(accountId, phoneNumberId);
  const nowIso = new Date().toISOString();

  Object.assign(session, {
    connected: validation.connected,
    connectionStatus: validation.connectionStatus,
    phoneNumber: validation.phoneNumber || session.phoneNumber || '',
    lastValidatedAt: nowIso,
    lastValidationError: validation.lastValidationError || '',
    expiryKnown: validation.expiryKnown,
  });

  if (validation.tokenExpiresAt) {
    session.tokenExpiresAt = validation.tokenExpiresAt;
  } else if (!validation.expiryKnown) {
    session.tokenExpiresAt = undefined;
  }

  syncLegacyWhatsAppSession(account);
  await account.save();
  return validation;
}

function getMediaTypeLabelByType(type: string): string {
  if (type === 'audio') return '🔊 Audio';
  if (type === 'image') return '📷 Imagen';
  if (type === 'video') return '🎥 Video';
  if (type === 'document') return '📄 Documento';
  return '📎 Archivo';
}

function getMediaMimeTypeFromMessage(msg: any): string {
  if (msg?.image?.mime_type) return msg.image.mime_type;
  if (msg?.video?.mime_type) return msg.video.mime_type;
  if (msg?.audio?.mime_type) return msg.audio.mime_type;
  if (msg?.document?.mime_type) return msg.document.mime_type;
  return 'application/octet-stream';
}

function getMediaFileNameFromMessage(msg: any): string {
  if (msg?.document?.filename) return msg.document.filename;
  const mime = getMediaMimeTypeFromMessage(msg);
  const ext = mime.split('/')[1]?.split(';')[0] || 'bin';
  return `${msg.type || 'file'}_${Date.now()}.${ext}`;
}

function isMediaMessage(msg: any): boolean {
  return msg?.type === 'image' || msg?.type === 'video' || msg?.type === 'audio' || msg?.type === 'document';
}

async function findAccountByPhoneNumberId(phoneNumberId: string): Promise<any | null> {
  if (!phoneNumberId) return null;
  return Automation.findOne({ 'whatsappSessions.phoneNumberId': phoneNumberId });
}

function resolveWhatsAppSession(account: any, phoneNumberId?: string, instanceName?: string): any | null {
  if (phoneNumberId) {
    const exactSession = (account?.whatsappSessions || []).find((session: any) => session.phoneNumberId === phoneNumberId);
    if (exactSession) return exactSession;
    if (account?.whatsappSession?.phoneNumberId === phoneNumberId) return account.whatsappSession;
    return null;
  }

  if (instanceName) {
    const matchingInstance = (account?.whatsappSessions || []).find((session: any) => session.instanceName === instanceName);
    if (matchingInstance) return matchingInstance;
    if (account?.whatsappSession?.instanceName === instanceName) return account.whatsappSession;
  }

  return account?.whatsappSessions?.find((session: any) => session.connected) || account?.whatsappSession || null;
}

function getSessionToken(account: any, session?: any): string {
  const resolvedSession = session || resolveWhatsAppSession(account);
  const encrypted = resolvedSession?.accessToken || '';
  return decryptPassword(encrypted);
}

function toCuentaConfig(cuentaCorreo: any): CuentaCorreoConfig {
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

function getWAAttachmentSigningSecret(): string {
  return process.env.WHATSAPP_ATTACHMENT_SECRET || process.env.JWT_SECRET || 'lyrium-wa-attachments';
}

function createWAId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function signWAPublicAttachment(filename: string, expiresAt: number): string {
  return crypto
    .createHmac('sha256', getWAAttachmentSigningSecret())
    .update(`${filename}:${expiresAt}`)
    .digest('hex');
}

function safeHexEqual(expected: string, received: string): boolean {
  if (!expected || !received || expected.length !== received.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    return false;
  }
}

function isTransientMetaStatusError(err: unknown): boolean {
  const message = String((err as any)?.message || err || '');
  return /failed \(429\)|failed \(5\d\d\)|fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(message);
}

export interface WAOutgoingAttachment {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export function buildWAPublicAttachmentUrl(
  filename: string,
  expiresAt = Date.now() + WA_PUBLIC_ATTACHMENT_TTL_MS,
): string {
  const signature = signWAPublicAttachment(filename, expiresAt);
  return `${getBackendPublicUrl()}/api/whatsapp/public-attachments/${encodeURIComponent(filename)}?exp=${expiresAt}&sig=${signature}`;
}

export function isValidWAPublicAttachmentSignature(
  filename: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (!filename || !signature || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = signWAPublicAttachment(filename, expiresAt);
  return safeHexEqual(expected, signature);
}

function getLastIncomingConversationTimestamp(conversation: any): number | null {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.sent) continue;

    const timestamp = new Date(message?.time || '').getTime();
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return null;
}

export function isWhatsAppConversationOutside24h(conversation: any, now = Date.now()): boolean {
  const lastIncomingTimestamp = getLastIncomingConversationTimestamp(conversation);
  if (lastIncomingTimestamp === null) return false;
  return now - lastIncomingTimestamp > WA_CUSTOMER_CARE_WINDOW_MS;
}

function getKBContext(account: any): string {
  let context = '';
  for (const doc of account.documentos || []) {
    if (doc.extractedText) {
      context += `\n--- DOCUMENTO: ${doc.nombre} ---\n${doc.extractedText}\n`;
    }
  }
  return context;
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

function getWhatsAppConversationFolderKey(conversationId: string): string {
  return `whatsapp:${conversationId}`;
}

function getUnifiedConsultaEmails(account: any): string[] {
  const merged = [
    ...(Array.isArray(account?.correosConsultas) ? account.correosConsultas : []),
    ...(Array.isArray(account?.whatsappCorreosConsultas) ? account.whatsappCorreosConsultas : []),
  ]
    .map((email: any) => String(email || '').trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(merged)).slice(0, 1);
}

function buildWhatsAppEngineMessages(messages: any[]): Array<{
  fechaHora: string;
  autor: 'cliente' | 'asistente' | 'humano';
  canal: 'whatsapp';
  texto: string;
}> {
  return (messages || []).slice(-20).map((message: any) => ({
    fechaHora: message.time || new Date().toISOString(),
    autor: message.sent ? 'asistente' : 'cliente',
    canal: 'whatsapp',
    texto: String(message.text || ''),
  }));
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
    folder.conversationIds = (folder.conversationIds || []).filter((id: string) => id !== conversationId);
    if (!folder.conversationIds.includes(folderKey)) {
      folder.conversationIds.push(folderKey);
      modified = true;
    }
  }
  if (modified) {
    await account.save();
  }
}

async function ensurePendingWhatsAppCase(
  accountId: string,
  account: any,
  contactName: string,
  contactPhone: string,
  conversationId: string,
  originalText: string,
  especialidadId?: string,
): Promise<void> {
  const CaseModel = (await import('../models/Case.js')).default;
  const existing = await CaseModel.findOne({ accountId, source: 'whatsapp', sourceId: conversationId }).select('_id').lean();
  if (existing) return;

  const { client } = await findOrCreateClient(accountId, undefined, contactPhone, contactName);
  await createCaseFromWhatsApp(
    accountId,
    account,
    contactName,
    contactPhone,
    conversationId,
    originalText,
    especialidadId,
    'solicitud_servicio',
    'pending',
    undefined,
    undefined,
    client._id,
  );
}

async function classifyWhatsAppMessage(
  body: string,
  especialidades: Array<{ id: string; nombre: string; descripcion: string }> = [],
  historyContext = '',
): Promise<{ type: 'consulta_general' | 'solicitud_servicio' | 'otro'; especialidadId?: string }> {
  try {
    const espList = especialidades.map((e) => `- ID: ${e.id} | Nombre: "${e.nombre}" | Descripción: "${e.descripcion}"`).join('\n');
    const prompt = `Clasifica este mensaje de WhatsApp del cliente en una de estas 3 categorias:\n\n1. "consulta_general" — pregunta general, solicitud de informacion, dudas sobre servicios/precios/horarios/disponibilidad, o cualquier mensaje humano con pregunta\n2. "solicitud_servicio" — quiere contratar/encargar un servicio legal concreto\n3. "otro" — spam o mensaje automatico sin contenido humano util\n\nIMPORTANTE: Si tienes duda, responde "consulta_general".\n\n${especialidades.length > 0 ? `Si es "solicitud_servicio", indica qué especialidad encaja mejor de las siguientes. Si ninguna encaja, devuelve "especialidadId": null.\n${espList}\n\n` : ''}Responde SOLO con JSON: {"type":"consulta_general"|"solicitud_servicio"|"otro"${especialidades.length > 0 ? ',"especialidadId":"id o null"' : ''}}${historyContext ? `\n\n${historyContext}` : ''}\n/no_think`;

    const response = await getAI().chat.completions.create({
      model: AI_AUTOMATION_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: body.substring(0, 2000) },
      ],
      max_tokens: 120,
      temperature: 0.1,
    });

      const content = stripThinkTags(response.choices?.[0]?.message?.content || '').trim();
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const type = parsed?.type;
      if (type === 'consulta_general' || type === 'solicitud_servicio' || type === 'otro') {
        const especialidadId = parsed?.especialidadId;
        return {
          type,
          especialidadId: especialidadId && especialidadId !== 'null' ? String(especialidadId) : undefined,
        };
      }
    }
  } catch (err) {
    console.error('[WA] classifyWhatsAppMessage error:', err);
  }

  return { type: 'consulta_general' };
}

function findPendingWhatsAppConfirmation(account: any, conversationId: string, contactPhone: string): any | null {
  return (account.pendingConsultas || []).find((pending: any) =>
    pending.channel === 'whatsapp'
    && pending.type === 'confirmacion_asignacion'
    && (
      (pending.waConversationId && pending.waConversationId === conversationId)
      || (pending.waContactPhone && sanitizePhone(pending.waContactPhone) === sanitizePhone(contactPhone))
    )
  ) || null;
}

function appendAssistantMessage(conversation: any, text: string): void {
  conversation.messages.push({
    id: createWAId('wa_reply'),
    from: 'lyra',
    text,
    time: new Date().toISOString(),
    sent: true,
  });
  conversation.lastMessageTime = new Date().toISOString();
}

async function sendAssistantText(
  instanceName: string,
  contactPhone: string,
  conversation: any,
  text: string,
  phoneNumberId?: string,
): Promise<boolean> {
  try {
    await sendTextMessage(instanceName, contactPhone, text, phoneNumberId);
    appendAssistantMessage(conversation, text);
    return true;
  } catch (err) {
    console.error('[WA] Error enviando mensaje automático:', err);
    return false;
  }
}

async function findAnswerInKB(
  question: string,
  kbContext: string,
  historyContext = '',
): Promise<{ found: boolean; answer: string | null }> {
  if (!kbContext || kbContext.trim().length === 0) {
    return { found: false, answer: null };
  }

  try {
    const response = await getAI().chat.completions.create({
      model: AI_AUTOMATION_MODEL,
      messages: [
        {
          role: 'system',
          content: `Eres asistente de un despacho legal. Responde SOLO con informacion de los documentos proporcionados. Si no hay informacion suficiente, responde exactamente NO_TENGO_INFO.\n\nDOCUMENTOS:\n${kbContext.substring(0, 14000)}\n/no_think`,
        },
        {
          role: 'user',
          content: `${historyContext ? historyContext + '\n\n' : ''}PREGUNTA: ${question.substring(0, 3000)}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const answer = stripThinkTags(response.choices?.[0]?.message?.content || '').trim();
    if (!answer || answer.toUpperCase().includes('NO_TENGO_INFO')) {
      return { found: false, answer: null };
    }
    return { found: true, answer };
  } catch (err) {
    console.error('[WA] findAnswerInKB error:', err);
    return { found: false, answer: null };
  }
}

async function applyWhatsAppClassifyRules(
  account: any,
  conversationId: string,
  messageText: string,
): Promise<void> {
  const rules: Array<{ id: string; name: string; description: string; folderIds: string[] }> = account.whatsappClassifyRules || [];
  if (rules.length === 0) return;

  const folders: Array<{ id: string; name: string; conversationIds: string[] }> = account.emailFolders || [];
  if (folders.length === 0) return;

  let modified = false;

  for (const rule of rules) {
    const targetFolderIds = (rule.folderIds || []).filter((fid) => folders.some((f) => f.id === fid));
    if (targetFolderIds.length === 0) continue;

    const folderNames = targetFolderIds.map((fid) => folders.find((f) => f.id === fid)?.name || fid).join(', ');
    const prompt = `Regla de clasificacion WhatsApp:\nNombre: "${rule.name}"\nDescripcion: "${rule.description}"\nCarpetas destino: "${folderNames}"\n\nMensaje entrante:\n${messageText.substring(0, 2000)}\n\nResponde SOLO con JSON: {"match": true} o {"match": false}\n/no_think`;

    try {
      const response = await getAI().chat.completions.create({
        model: AI_AUTOMATION_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 80,
        temperature: 0.1,
      });

    const content = stripThinkTags(response.choices?.[0]?.message?.content || '').trim();
      const json = content.match(/\{[\s\S]*\}/);
      if (!json) continue;

      const parsed = JSON.parse(json[0]);
      if (parsed.match !== true) continue;

      for (const folderId of targetFolderIds) {
        const folder = account.emailFolders.find((f: any) => f.id === folderId);
        const folderKey = getWhatsAppConversationFolderKey(conversationId);
        if (folder && !folder.conversationIds.includes(folderKey)) {
          folder.conversationIds = (folder.conversationIds || []).filter((id: string) => id !== conversationId);
          folder.conversationIds.push(folderKey);
          modified = true;
        }
      }
    } catch (err) {
      console.error('[WA] applyWhatsAppClassifyRules error in rule', rule.id, err);
    }
  }

  if (modified) {
    await account.save();
  }
}

async function forwardWhatsAppToConsultas(
  account: any,
  conversationId: string,
  contactPhone: string,
  contactName: string,
  messageText: string,
  type: 'consulta_general' | 'solicitud_sin_especialista' = 'consulta_general',
  mediaAttachment?: { filename: string; originalName: string; mimeType: string },
  customMessage?: string,
): Promise<boolean> {
  const consultaEmails: string[] = getUnifiedConsultaEmails(account);
  if (consultaEmails.length === 0) return false;

  const cuentaCorreo = (account.cuentasCorreo || [])[0];
  const cuentaConfig = cuentaCorreo ? toCuentaConfig(cuentaCorreo) : null;

  const consultaId = Date.now().toString();
  const subject = `[Consulta pendiente] [CP-${consultaId}] WhatsApp: ${contactName} (+${contactPhone})`;

  let body = customMessage?.trim()
    ? `${customMessage.trim()}\n\n`
    : `Se ha recibido una consulta por WhatsApp que requiere respuesta manual.\n\n`;
  body += `CONTACTO: ${contactName} (+${contactPhone})\n`;
  body += `MENSAJE:\n${messageText}\n\n`;

  if (mediaAttachment?.filename) {
    try {
      body += `ADJUNTO ENLACE: ${buildWAPublicAttachmentUrl(mediaAttachment.filename)}\n\n`;
    } catch (err) {
      console.warn('[WA] No se pudo generar enlace público firmado para adjunto de consulta:', err);
    }
  }

  body += `Responde a este email con las instrucciones para responder al cliente por WhatsApp.\n`;
  body += `Tambien puedes escribir "pausa la respuesta automatica" para pausar respuestas automáticas a este contacto.`;

  const attachments: Array<{ filename: string; content: Buffer; mimeType: string }> = [];
  if (mediaAttachment?.filename) {
    const filePath = path.join(WA_ATTACHMENTS_DIR, mediaAttachment.filename);
    if (fs.existsSync(filePath)) {
      attachments.push({
        filename: mediaAttachment.originalName || mediaAttachment.filename,
        content: fs.readFileSync(filePath),
        mimeType: mediaAttachment.mimeType || 'application/octet-stream',
      });
    }
  }

  let sentAtLeastOne = false;
  for (const consultaEmail of consultaEmails) {
    try {
      if (cuentaConfig) {
        await sendEmailViaCuenta(cuentaConfig, consultaEmail, subject, body, attachments.length > 0 ? attachments : undefined);
      } else {
        const fallbackOk = await sendEmail(String(account._id), {
          to: consultaEmail,
          subject,
          text: body,
        });
        if (!fallbackOk) {
          throw new Error('No se pudo enviar el correo de consulta con la configuración legacy');
        }
      }
      sentAtLeastOne = true;
    } catch (err) {
      console.error('[WA] Error reenviando consulta a', consultaEmail, err);
    }
  }

  if (!sentAtLeastOne) return false;

  if (!account.pendingConsultas) account.pendingConsultas = [];
  account.pendingConsultas.push({
    id: consultaId,
    originalFrom: contactPhone,
    originalFromName: contactName,
    originalSubject: `WhatsApp ${contactName}`,
    originalBody: messageText,
    cuentaCorreoId: cuentaCorreo?.id || '',
    conversationId,
    forwardedAt: new Date().toISOString(),
    type,
    channel: 'whatsapp',
    waContactPhone: contactPhone,
    waConversationId: conversationId,
  });

  await account.save();
  return true;
}

async function downloadMetaMedia(
  phoneNumberId: string,
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  const account = await findAccountByPhoneNumberId(phoneNumberId);
  if (!account) return null;

  const session = resolveWhatsAppSession(account, phoneNumberId);
  const token = getSessionToken(account, session);
  if (!token || !session?.phoneNumberId) return null;

  try {
    const meta = await graphFetchJson<any>(`/${mediaId}`, token);
    const mediaUrl = meta?.url;
    if (!mediaUrl) return null;

    const buffer = await graphFetchBuffer(mediaUrl, token);
    const mimeType = meta?.mime_type || 'application/octet-stream';
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const filename = `${Date.now()}_${mediaId}.${ext}`;

    return { buffer, mimeType, filename };
  } catch (err) {
    console.error('[WA] downloadMetaMedia error:', err);
    return null;
  }
}

async function processOneIncomingMetaMessage(
  accountId: string,
  phoneNumberId: string,
  value: any,
  msg: any,
): Promise<void> {
  await withAccountLock(accountId, async () => {
    const account = await Automation.findById(accountId);
    if (!account) return;

    const contactPhone = sanitizePhone(msg?.from || '');
    if (!contactPhone) return;

    const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
    const contactInfo = contacts.find((c: any) => sanitizePhone(c?.wa_id || '') === contactPhone);
    const contactName = contactInfo?.profile?.name || contactPhone;

    const text = msg?.text?.body || msg?.image?.caption || msg?.video?.caption || msg?.document?.caption || '';
    const hasMedia = isMediaMessage(msg);
    if (!text && !hasMedia) return;

    let conv = account.whatsappConversations.find(
      (c: any) => c.contactPhone === contactPhone && (!c.phoneNumberId || c.phoneNumberId === phoneNumberId)
    );
    const isKnownContact = !!conv;

    if (!conv) {
      conv = {
        id: createWAId('waconv'),
        contactName,
        contactPhone,
        messages: [],
        lastMessageTime: new Date().toISOString(),
        unread: 0,
        autoReplyPaused: false,
        phoneNumberId,
      } as any;
      account.whatsappConversations.push(conv as any);
    }

    const conversation = conv as any;

    if (conversation.messages.some((m: any) => m.id === msg.id)) return;

    let savedAttachment: { id: string; filename: string; originalName: string; mimeType: string; size: number } | undefined;
    if (hasMedia) {
      const mediaId = msg?.image?.id || msg?.video?.id || msg?.audio?.id || msg?.document?.id;
      if (mediaId) {
        const mediaData = await downloadMetaMedia(phoneNumberId, mediaId);
        if (mediaData) {
          const originalName = msg?.document?.filename || getMediaFileNameFromMessage(msg);
          const diskFilename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const filePath = path.join(WA_ATTACHMENTS_DIR, diskFilename);
          fs.writeFileSync(filePath, mediaData.buffer);

          savedAttachment = {
            id: `wa_att_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            filename: diskFilename,
            originalName,
            mimeType: mediaData.mimeType,
            size: mediaData.buffer.length,
          };
        }
      }
    }

    const incomingText = text || `[${getMediaTypeLabelByType(msg.type)}]`;
    const incomingMsg: any = {
      id: msg.id,
      from: contactPhone,
      text: incomingText,
      time: new Date().toISOString(),
      sent: false,
    };

    if (savedAttachment) incomingMsg.attachments = [savedAttachment];

    conversation.messages.push(incomingMsg);
    conversation.unread = (conversation.unread || 0) + 1;
    conversation.lastMessageTime = new Date().toISOString();
    if (contactName && contactName !== contactPhone) conversation.contactName = contactName;

    await account.save();

    if (!account.whatsappSwitchActivo || conversation.autoReplyPaused) {
      await applyWhatsAppClassifyRules(account, conversation.id, incomingText);
      return;
    }

    const historyMessages = (conversation.messages || []).slice(0, -1).map((m: any) => `${m.sent ? 'Asistente' : contactName}: ${m.text}`).join('\n');
    const historyContext = historyMessages ? `CONTEXTO PREVIO:\n${historyMessages.substring(0, 6000)}` : '';
    const session = resolveWhatsAppSession(account, phoneNumberId);
    if (!session?.connected || !session.phoneNumberId) {
      console.warn('[WA] No hay una sesión conectada para la conversación entrante:', phoneNumberId);
      return;
    }
    const instanceName = session.instanceName || `lyrium_${accountId}`;

    const pendingConfirmation = text.trim()
      ? findPendingWhatsAppConfirmation(account, conversation.id, contactPhone)
      : null;

    if (pendingConfirmation) {
      const pendingIndex = (account.pendingConsultas || []).findIndex((p: any) => p.id === pendingConfirmation.id);
      if (pendingIndex !== -1) {
        account.pendingConsultas.splice(pendingIndex, 1);
      }

      const isAffirmative = await interpretClientConfirmation(text);
      const clientLanguage = await resolveAutomationLanguage(
        accountId,
        pendingConfirmation.originalSubject,
        pendingConfirmation.originalBody,
        text,
      );
      if (isAffirmative) {
        const assigned = await assignWhatsAppCase(accountId, account, {
          contactName,
          contactPhone,
          conversationId: conversation.id,
          originalText: pendingConfirmation.originalBody || text,
          especialidadId: pendingConfirmation.especialidadId,
        });

        if (assigned) {
          try {
            const CaseModel = (await import('../models/Case.js')).default;
            await CaseModel.findOneAndUpdate(
              { accountId, sourceId: conversation.id, status: 'pending' },
              {
                status: 'assigned',
                assignedSubaccountId: assigned.subaccountId,
                assignedSubaccountName: assigned.subaccountName || '',
                assignedAt: new Date().toISOString(),
              }
            );
          } catch (err) {
            console.error('[WhatsApp] error updating case after assignment:', err);
          }

          await sendAssistantText(
            instanceName,
            contactPhone,
            conversation,
            getAutomationMessage(clientLanguage, 'assignedSpecializedLawyer'),
            session.phoneNumberId,
          );
          await account.save();
          return;
        }

        const fallbackMsg = getAutomationMessage(clientLanguage, 'requestUnderReview');
        if (await sendAssistantText(instanceName, contactPhone, conversation, fallbackMsg, session.phoneNumberId)) {
          await account.save();
        }
        await forwardWhatsAppToConsultas(
          account,
          conversation.id,
          contactPhone,
          contactName,
          pendingConfirmation.originalBody || text,
          'solicitud_sin_especialista',
        );
        return;
      }

      await sendAssistantText(
        instanceName,
        contactPhone,
        conversation,
        getAutomationMessage(clientLanguage, 'futureNeedServices'),
        session.phoneNumberId,
      );
      await account.save();
      return;
    }

    if (hasMedia) {
      await applyWhatsAppClassifyRules(account, conversation.id, incomingText);
      await forwardWhatsAppToConsultas(
        account,
        conversation.id,
        contactPhone,
        contactName,
        incomingText,
        'consulta_general',
        savedAttachment ? { filename: savedAttachment.filename, originalName: savedAttachment.originalName, mimeType: savedAttachment.mimeType } : undefined,
      );
      return;
    }

    const classification = await classifyWhatsAppMessage(text, account.especialidades || [], historyContext);
    const respondConsultas = account.whatsappRespondConsultasGenerales !== false;
    const respondSolicitudes = account.whatsappRespondSolicitudesServicio !== false;
    const soloConocidos = account.whatsappSoloContactosConocidos === true;

    await applyWhatsAppClassifyRules(account, conversation.id, text);

    if (soloConocidos && !isKnownContact && classification.type !== 'otro') return;
    if (classification.type === 'consulta_general' && !respondConsultas) return;
    if (classification.type === 'solicitud_servicio' && !respondSolicitudes) return;
    if (classification.type === 'otro') return;

    if (classification.type === 'consulta_general') {
      const kbContext = getKBContext(account);
      const kbResult = await findAnswerInKB(text, kbContext, historyContext);

      if (kbResult.found && kbResult.answer) {
        if (await sendAssistantText(instanceName, contactPhone, conversation, kbResult.answer, session.phoneNumberId)) {
          await account.save();
        }
      } else {
        await forwardWhatsAppToConsultas(account, conversation.id, contactPhone, contactName, text, 'consulta_general');
      }
      return;
    }

    if (classification.type === 'solicitud_servicio') {
      if (!account.autoAssignEnabled) {
        // Create pending case and stop
        const { client } = await findOrCreateClient(accountId, undefined, contactPhone, contactName);
        await createCaseFromWhatsApp(accountId, account, contactName, contactPhone, conversation.id, text, classification.especialidadId, 'solicitud_servicio', 'pending', undefined, undefined, client._id);
        await applyWhatsAppClassifyRules(account, conversation.id, text);
        await account.save();
        return;
      }

      const clientLanguage = await resolveAutomationLanguage(accountId, `WhatsApp ${contactName}`, text);

      const canAssign = await hasMatchingSpecialist(accountId, account, classification.especialidadId);
      if (canAssign) {
        const explicitRequest = await detectExplicitAssignmentRequest(text, `WhatsApp ${contactName}`);

        if (explicitRequest) {
          const assigned = await assignWhatsAppCase(accountId, account, {
            contactName,
            contactPhone,
            conversationId: conversation.id,
            originalText: text,
            especialidadId: classification.especialidadId,
          });

          if (assigned) {
            // Update case to assigned
            try {
              const CaseModel = (await import('../models/Case.js')).default;
              await CaseModel.findOneAndUpdate(
                { accountId, sourceId: conversation.id, status: 'pending' },
                {
                  status: 'assigned',
                  assignedSubaccountId: assigned.subaccountId,
                  assignedSubaccountName: assigned.subaccountName || '',
                  assignedAt: new Date().toISOString(),
                }
              );
            } catch (err) {
              console.error('[WhatsApp] error updating case after assignment:', err);
            }

            await sendAssistantText(
              instanceName,
              contactPhone,
              conversation,
              getAutomationMessage(clientLanguage, 'assignedSpecializedLawyer'),
              session.phoneNumberId,
            );
            await account.save();
            return;
          }

          const fallbackMsg = getAutomationMessage(clientLanguage, 'requestUnderReview');
          if (await sendAssistantText(instanceName, contactPhone, conversation, fallbackMsg, session.phoneNumberId)) {
            await account.save();
          }
          await forwardWhatsAppToConsultas(
            account,
            conversation.id,
            contactPhone,
            contactName,
            text,
            'solicitud_sin_especialista',
          );
          return;
        }

        // Ask client before assigning — create pending case
        const { client } = await findOrCreateClient(accountId, undefined, contactPhone, contactName);
        await createCaseFromWhatsApp(accountId, account, contactName, contactPhone, conversation.id, text, classification.especialidadId, 'solicitud_servicio', 'pending', undefined, undefined, client._id);
        const askMsg = getAutomationMessage(clientLanguage, 'assignmentAskWhatsApp', {
          espName: account.especialidades.find((e: any) => e.id === classification.especialidadId)?.nombre || 'su caso',
        });
        if (await sendAssistantText(instanceName, contactPhone, conversation, askMsg, session.phoneNumberId)) {
          await account.save();
        }
        // Save pending confirmation
        account.pendingConsultas.push({
          id: Date.now().toString(),
          originalFrom: contactPhone,
          originalFromName: contactName,
          originalSubject: `WhatsApp ${contactName}`,
          originalBody: text,
          cuentaCorreoId: '',
          conversationId: conversation.id,
          forwardedAt: new Date().toISOString(),
          type: 'confirmacion_asignacion',
          especialidadId: classification.especialidadId,
          channel: 'whatsapp',
          waContactPhone: contactPhone,
          waConversationId: conversation.id,
        });
        await account.save();
        return;
      } else {
        // No specialist — create pending case and forward
        const { client } = await findOrCreateClient(accountId, undefined, contactPhone, contactName);
        await createCaseFromWhatsApp(accountId, account, contactName, contactPhone, conversation.id, text, classification.especialidadId, 'solicitud_servicio', 'pending', undefined, undefined, client._id);
        await forwardWhatsAppToConsultas(account, conversation.id, contactPhone, contactName, text, 'solicitud_sin_especialista');
        return;
      }
    }
  });
}

async function processOneIncomingMetaMessageUnified(
  accountId: string,
  phoneNumberId: string,
  value: any,
  msg: any,
): Promise<void> {
  await withAccountLock(accountId, async () => {
    const account = await Automation.findById(accountId);
    if (!account) return;

    const contactPhone = sanitizePhone(msg?.from || '');
    if (!contactPhone) return;

    const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
    const contactInfo = contacts.find((c: any) => sanitizePhone(c?.wa_id || '') === contactPhone);
    const contactName = contactInfo?.profile?.name || contactPhone;
    const text = msg?.text?.body || msg?.image?.caption || msg?.video?.caption || msg?.document?.caption || '';
    const hasMedia = isMediaMessage(msg);
    if (!text && !hasMedia) return;

    let conv = account.whatsappConversations.find(
      (conversation: any) => conversation.contactPhone === contactPhone && (!conversation.phoneNumberId || conversation.phoneNumberId === phoneNumberId),
    );
    if (!conv) {
      conv = {
        id: createWAId('waconv'),
        contactName,
        contactPhone,
        messages: [],
        lastMessageTime: new Date().toISOString(),
        unread: 0,
        autoReplyPaused: false,
        phoneNumberId,
      } as any;
      account.whatsappConversations.push(conv as any);
    }

    const conversation = conv as any;
    if (conversation.messages.some((message: any) => message.id === msg.id)) return;

    let savedAttachment: { id: string; filename: string; originalName: string; mimeType: string; size: number } | undefined;
    if (hasMedia) {
      const mediaId = msg?.image?.id || msg?.video?.id || msg?.audio?.id || msg?.document?.id;
      if (mediaId) {
        const mediaData = await downloadMetaMedia(phoneNumberId, mediaId);
        if (mediaData) {
          const originalName = msg?.document?.filename || getMediaFileNameFromMessage(msg);
          const diskFilename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const filePath = path.join(WA_ATTACHMENTS_DIR, diskFilename);
          fs.writeFileSync(filePath, mediaData.buffer);
          savedAttachment = {
            id: `wa_att_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            filename: diskFilename,
            originalName,
            mimeType: mediaData.mimeType,
            size: mediaData.buffer.length,
          };
        }
      }
    }

    const incomingText = text || `[${getMediaTypeLabelByType(msg.type)}]`;
    const incomingMsg: any = {
      id: msg.id,
      from: contactPhone,
      text: incomingText,
      time: new Date().toISOString(),
      sent: false,
    };
    if (savedAttachment) incomingMsg.attachments = [savedAttachment];

    conversation.messages.push(incomingMsg);
    conversation.unread = (conversation.unread || 0) + 1;
    conversation.lastMessageTime = new Date().toISOString();
    if (contactName && contactName !== contactPhone) conversation.contactName = contactName;
    await account.save();

    if (!account.whatsappSwitchActivo || conversation.autoReplyPaused) {
      await applyWhatsAppClassifyRules(account, conversation.id, incomingText);
      return;
    }

    const session = resolveWhatsAppSession(account, phoneNumberId);
    if (!session?.connected || !session.phoneNumberId) {
      console.warn('[WA] No hay una sesion conectada para la conversacion entrante:', phoneNumberId);
      return;
    }

    const outside24h = isWhatsAppConversationOutside24h(conversation);
    const contactoConocido = (Array.isArray(conversation.messages) && conversation.messages.length > 1)
      || (account.whatsappConversations || []).some(
        (item: any) => sanitizePhone(item.contactPhone || '') === contactPhone && item.id !== conversation.id,
      );
    const assignableCandidates = await listAssignableCandidates(accountId);
    const decision = await runCustomerAutomationEngine({
      workspaceId: accountId,
      canalEntrada: 'whatsapp',
      contactoConocido,
      responseAutomaticaActiva: account.whatsappSwitchActivo === true,
      toggles: {
        respondConsultasGenerales: account.whatsappRespondConsultasGenerales !== false,
        respondSolicitudesServicio: account.whatsappRespondSolicitudesServicio !== false,
        soloContactosConocidos: account.whatsappSoloContactosConocidos === true,
        autoAssignEnabled: account.autoAssignEnabled === true,
        sortByCarga: account.sortByCarga === true,
      },
      restricciones: {
        soloResponderMismoCanal: true,
        whatsappVentana24hAbierta: !outside24h,
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
      carpetas: getWhatsAppFolderDescriptions(account),
      reglasOrganizacion: (account.whatsappClassifyRules || []).map((rule: any) => ({
        id: rule.id,
        nombre: rule.name,
        descripcion: rule.description || '',
        folderIds: rule.folderIds || [],
      })),
      correoConsultas: {
        destino: getUnifiedConsultaEmails(account),
        cuentaOperativa: (account.cuentasCorreo || []).map((item: any) => item.correo).filter(Boolean),
      },
      documentos: (account.documentos || []).map((doc: any) => ({
        nombre: doc.nombre,
        texto: doc.extractedText || '',
      })),
      ultimos20Mensajes: buildWhatsAppEngineMessages(conversation.messages || []),
    });

    await assignWhatsAppConversationToFolders(account, conversation.id, decision.folderIds);

    if (decision.clasificacion.tipo === 'solicitud_servicio') {
      await ensurePendingWhatsAppCase(
        accountId,
        account,
        contactName,
        contactPhone,
        conversation.id,
        incomingText,
        decision.clasificacion.especialidadId,
      );
    }

    if (decision.accion === 'preguntar_consultas') {
      await forwardWhatsAppToConsultas(
        account,
        conversation.id,
        contactPhone,
        contactName,
        incomingText,
        decision.clasificacion.tipo === 'solicitud_servicio' ? 'solicitud_sin_especialista' : 'consulta_general',
        savedAttachment ? { filename: savedAttachment.filename, originalName: savedAttachment.originalName, mimeType: savedAttachment.mimeType } : undefined,
        decision.mensajeConsultas,
      );
      return;
    }

    if (decision.accion === 'pause_auto_reply') {
      conversation.autoReplyPaused = true;
      await account.save();
    }

    if (decision.accion === 'assign_case') {
      const assigned = decision.asignarA
        ? await assignWhatsAppCaseToCandidateId(accountId, account, decision.asignarA, {
          contactName,
          contactPhone,
          conversationId: conversation.id,
          originalText: incomingText,
          especialidadId: decision.clasificacion.especialidadId,
        })
        : await assignWhatsAppCase(accountId, account, {
          contactName,
          contactPhone,
          conversationId: conversation.id,
          originalText: incomingText,
          especialidadId: decision.clasificacion.especialidadId,
        });
      if (!assigned) {
        return;
      }
    }

    if (decision.accion === 'ask_assignment') {
      if (!decision.mensajeCliente || outside24h) {
        return;
      }

      const instanceName = session.instanceName || `lyrium_${accountId}`;
      if (await sendAssistantText(instanceName, contactPhone, conversation, decision.mensajeCliente, session.phoneNumberId)) {
        upsertPendingAssignmentConfirmation(account, {
          originalFrom: contactPhone,
          originalFromName: contactName,
          originalSubject: `WhatsApp ${contactName}`,
          originalBody: incomingText,
          cuentaCorreoId: '',
          conversationId: conversation.id,
          especialidadId: decision.clasificacion.especialidadId,
          channel: 'whatsapp',
          waContactPhone: contactPhone,
          waConversationId: conversation.id,
        });
        await account.save();
      }
      return;
    }

    if (!decision.mensajeCliente || decision.accion === 'no_responder' || outside24h) {
      return;
    }

    const instanceName = session.instanceName || `lyrium_${accountId}`;
    if (await sendAssistantText(instanceName, contactPhone, conversation, decision.mensajeCliente, session.phoneNumberId)) {
      await account.save();
    }
  });
}

// ── Meta onboarding / status ─────────────────────────────────────────
export async function createInstance(accountId: string, redirectUriOverride?: string): Promise<{ instanceName: string; authUrl: string }> {
  const appId = getMetaAppId();
  const redirectUri = redirectUriOverride || getMetaRedirectUri();
  const state = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const instanceName = `lyrium_${accountId}`;

  await Automation.findByIdAndUpdate(
    accountId,
    {
      $set: {
        accountId,
        whatsappOAuthState: state,
        whatsappOAuthStateExpires: expires,
        whatsappSession: {
          provider: 'meta',
          instanceName,
          connected: false,
        },
      },
    },
    { upsert: true },
  );

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
  });

  const authUrl = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
  return { instanceName, authUrl };
}

async function connectMetaWithCodeInternal(
  account: any,
  accountId: string,
  code: string,
  state: string,
  redirectUri?: string,
  alertEmail?: string,
): Promise<{ connected: boolean; phoneNumber?: string; phoneNumberId?: string }> {
  if (!account) throw new Error('Cuenta no encontrada');
  const normalizedAlertEmail = String(alertEmail || '').trim();
  if (!isValidEmailAddress(normalizedAlertEmail)) {
    throw new Error('El email de alerta es obligatorio y debe ser valido');
  }

  const expectedState = account.whatsappOAuthState || '';
  const expectedExp = account.whatsappOAuthStateExpires || '';
  if (!expectedState || expectedState !== state) throw new Error('State OAuth inválido');
  if (!expectedExp || new Date(expectedExp).getTime() < Date.now()) throw new Error('State OAuth expirado');

  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();

  const tokenUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  // Embedded Signup (FB.login) flow omits redirect_uri; OAuth redirect flow passes it explicitly
  if (redirectUri) {
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
  }
  tokenUrl.searchParams.set('code', code);

  const tokenRes = await fetch(tokenUrl.toString());
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => '');
    throw new Error(`No se pudo canjear código OAuth (${tokenRes.status}): ${txt}`);
  }
  const tokenData = await tokenRes.json().catch(() => ({}));
  let accessToken = tokenData?.access_token as string;
  if (!accessToken) throw new Error('Meta no devolvió access_token');

  accessToken = await exchangeForLongLivedUserToken(accessToken);
  const tokenExchanged = true;

  const waba = await resolveSingleMetaWaba(accessToken);
  const phone = await resolveSingleMetaPhone(accessToken, waba.id);

  // Inicializar array si no existe
  if (!account.whatsappSessions) account.whatsappSessions = [];

  // Buscar si ya existe una sesión con este phoneNumberId
  const existingSession = account.whatsappSessions.find(
    (s: any) => s.phoneNumberId === phone.id
  );

  if (existingSession) {
    // Actualizar sesión existente
    Object.assign(existingSession, {
      connected: true,
      phoneNumber: phone.display_phone_number || '',
      businessAccountId: waba.id,
      phoneNumberId: phone.id,
      accessToken: encryptPassword(accessToken),
      connectedAt: new Date().toISOString(),
      instanceName: `lyrium_${accountId}`,
      tokenExpiresAt: tokenExchanged
        ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tokenType: tokenExchanged ? 'long' : 'short',
      name: existingSession.name || `WhatsApp ${phone.display_phone_number || ''}`,
      alertEmail: normalizedAlertEmail,
    });
  } else {
    // Añadir nueva sesión
    account.whatsappSessions.push({
      provider: 'meta',
      connected: true,
      phoneNumber: phone.display_phone_number || '',
      businessAccountId: waba.id,
      phoneNumberId: phone.id,
      accessToken: encryptPassword(accessToken),
      connectedAt: new Date().toISOString(),
      instanceName: `lyrium_${accountId}`,
      tokenExpiresAt: tokenExchanged
        ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tokenType: tokenExchanged ? 'long' : 'short',
      name: `WhatsApp ${phone.display_phone_number || ''}`,
      alertEmail: normalizedAlertEmail,
    });
  }

  // Mantener compatibilidad: actualizar también whatsappSession con la última sesión conectada
  account.whatsappSession = account.whatsappSessions[account.whatsappSessions.length - 1];
  const quickSession = resolveWhatsAppSession(account, phone.id);
  const quickTokenMetadata = await inspectMetaToken(accessToken);
  const quickTokenInfo = normalizeTokenMetadata(quickTokenMetadata, 'business_integration');
  Object.assign(quickSession || {}, {
    connected: true,
    connectionStatus: deriveConnectionStatus(quickTokenInfo.tokenExpiresAt, quickTokenInfo.expiryKnown),
    expiryKnown: quickTokenInfo.expiryKnown,
    tokenExpiresAt: quickTokenInfo.tokenExpiresAt,
    tokenType: 'business_integration',
    credentialMode: 'quick_official',
    alertEmail: alertEmail || quickSession?.alertEmail || '',
    lastValidatedAt: new Date().toISOString(),
    lastValidationError: '',
    failureAlertOpen: false,
  });
  syncLegacyWhatsAppSession(account);
  account.whatsappOAuthState = '';
  account.whatsappOAuthStateExpires = '';
  await account.save();

  return {
    connected: true,
    phoneNumber: phone.display_phone_number || '',
    phoneNumberId: phone.id,
  };
}

export async function connectMetaWithCode(
  accountId: string,
  code: string,
  state: string,
  redirectUri?: string,
): Promise<{ connected: boolean; phoneNumber?: string; phoneNumberId?: string }> {
  const account = await Automation.findById(accountId);
  // redirectUri undefined → embedded signup flow (no redirect_uri in token exchange)
  return connectMetaWithCodeInternal(account, accountId, code, state, redirectUri);
}

export async function connectMetaWithToken(
  accountId: string,
  state: string,
  shortLivedToken: string,
  name?: string,
  alertEmail?: string,
): Promise<{ connected: boolean; phoneNumber?: string; phoneNumberId?: string }> {
  const account = await Automation.findById(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  const normalizedAlertEmail = String(alertEmail || '').trim();
  if (!isValidEmailAddress(normalizedAlertEmail)) {
    throw new Error('El email de alerta es obligatorio y debe ser valido');
  }

  const expectedState = account.whatsappOAuthState || '';
  const expectedExp = account.whatsappOAuthStateExpires || '';
  if (!expectedState || expectedState !== state) throw new Error('State OAuth inválido');
  if (!expectedExp || new Date(expectedExp).getTime() < Date.now()) throw new Error('State OAuth expirado');

  void getMetaAppId();
  void getMetaAppSecret();
  let accessToken = await exchangeForLongLivedUserToken(shortLivedToken);
  const tokenExchanged = true;

  const waba = await resolveSingleMetaWaba(accessToken);
  const phone = await resolveSingleMetaPhone(accessToken, waba.id);

  // Inicializar array si no existe
  if (!account.whatsappSessions) account.whatsappSessions = [];

  // Buscar si ya existe una sesión con este phoneNumberId
  const existingSession = account.whatsappSessions.find(
    (s: any) => s.phoneNumberId === phone.id
  );

  if (existingSession) {
    // Actualizar sesión existente
    Object.assign(existingSession, {
      connected: true,
      phoneNumber: phone.display_phone_number || '',
      businessAccountId: waba.id,
      phoneNumberId: phone.id,
      accessToken: encryptPassword(accessToken),
      connectedAt: new Date().toISOString(),
      instanceName: `lyrium_${accountId}`,
      tokenExpiresAt: tokenExchanged
        ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tokenType: tokenExchanged ? 'long' : 'short',
      name: name || (existingSession as any).name || `WhatsApp ${phone.display_phone_number || ''}`,
      alertEmail: normalizedAlertEmail,
    });
  } else {
    // Añadir nueva sesión
    account.whatsappSessions.push({
      provider: 'meta',
      connected: true,
      phoneNumber: phone.display_phone_number || '',
      businessAccountId: waba.id,
      phoneNumberId: phone.id,
      accessToken: encryptPassword(accessToken),
      connectedAt: new Date().toISOString(),
      instanceName: `lyrium_${accountId}`,
      tokenExpiresAt: tokenExchanged
        ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tokenType: tokenExchanged ? 'long' : 'short',
      name: name || `WhatsApp ${phone.display_phone_number || ''}`,
      alertEmail: normalizedAlertEmail,
    });
  }

  // Mantener compatibilidad: actualizar también whatsappSession con la última sesión conectada
  account.whatsappSession = account.whatsappSessions[account.whatsappSessions.length - 1];
  account.whatsappOAuthState = '';
  account.whatsappOAuthStateExpires = '';
  await account.save();

  return {
    connected: true,
    phoneNumber: phone.display_phone_number || '',
    phoneNumberId: phone.id,
  };
}

export async function connectMetaManual(
  accountId: string,
  accessToken: string,
  phoneNumberId: string,
  wabaId?: string,
  name?: string,
  alertEmail?: string,
): Promise<{ connected: boolean; phoneNumber?: string; phoneNumberId?: string }> {
  const account = await Automation.findById(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  const normalizedAlertEmail = String(alertEmail || '').trim();
  if (!isValidEmailAddress(normalizedAlertEmail)) {
    throw new Error('El email de alerta es obligatorio y debe ser valido');
  }
  const longLivedToken = await exchangeForLongLivedUserToken(accessToken);

  // Verify token works and get phone number display
  const phoneData = await graphFetchJson<any>(`/${phoneNumberId}?fields=id,display_phone_number,verified_name`, longLivedToken);
  if (!phoneData?.id) throw new Error('No se pudo verificar el número con el token proporcionado');
  const tokenMetadata = await inspectMetaToken(longLivedToken);

  // Discover WABA ID if not provided
  let resolvedWabaId = wabaId || '';
  if (!resolvedWabaId) {
    try {
      const wabaData = await graphFetchJson<any>(`/${phoneNumberId}?fields=whatsapp_business_account`, longLivedToken);
      resolvedWabaId = wabaData?.whatsapp_business_account?.id || '';
    } catch {
      // Not critical — store without WABA ID
    }
  }

  // Inicializar array si no existe
  if (!account.whatsappSessions) account.whatsappSessions = [];

  // Buscar si ya existe una sesión con este phoneNumberId
  const existingSession = account.whatsappSessions.find(
    (s: any) => s.phoneNumberId === phoneData.id
  );

  if (existingSession) {
    // Actualizar sesión existente
    Object.assign(existingSession, {
      instanceName: `lyrium_${accountId}`,
      connected: true,
      phoneNumber: phoneData.display_phone_number || '',
      businessAccountId: resolvedWabaId,
      phoneNumberId: phoneData.id,
      accessToken: encryptPassword(accessToken),
      connectedAt: new Date().toISOString(),
      tokenExpiresAt: tokenMetadata.tokenExpiresAt,
      tokenType: tokenMetadata.tokenType,
      name: name || existingSession.name || `WhatsApp ${phoneData.display_phone_number || ''}`,
      alertEmail: normalizedAlertEmail,
    });
  } else {
    // Añadir nueva sesión
    account.whatsappSessions.push({
      instanceName: `lyrium_${accountId}`,
      provider: 'meta',
      connected: true,
      phoneNumber: phoneData.display_phone_number || '',
      businessAccountId: resolvedWabaId,
      phoneNumberId: phoneData.id,
      accessToken: encryptPassword(longLivedToken),
      connectedAt: new Date().toISOString(),
      tokenExpiresAt: tokenMetadata.tokenExpiresAt,
      tokenType: tokenMetadata.tokenType,
      name: name || `WhatsApp ${phoneData.display_phone_number || ''}`,
      alertEmail: normalizedAlertEmail,
    });
  }

  // Mantener compatibilidad: actualizar también whatsappSession con la última sesión conectada
  account.whatsappSession = account.whatsappSessions[account.whatsappSessions.length - 1];
  const manualSession = resolveWhatsAppSession(account, phoneData.id);
  Object.assign(manualSession || {}, {
    connected: true,
    connectionStatus: deriveConnectionStatus(tokenMetadata.tokenExpiresAt, !!tokenMetadata.tokenExpiresAt),
    expiryKnown: !!tokenMetadata.tokenExpiresAt,
    tokenExpiresAt: tokenMetadata.tokenExpiresAt,
    tokenType: 'long',
    credentialMode: 'manual_long_lived',
    alertEmail: normalizedAlertEmail,
    lastValidatedAt: new Date().toISOString(),
    lastValidationError: '',
    failureAlertOpen: false,
  });
  syncLegacyWhatsAppSession(account);
  await account.save();

  return {
    connected: true,
    phoneNumber: phoneData.display_phone_number || '',
    phoneNumberId: phoneData.id,
  };
}

export async function connectMetaWithCodeByState(
  code: string,
  state: string,
  redirectUri?: string,
  alertEmail?: string,
): Promise<{ connected: boolean; phoneNumber?: string; phoneNumberId?: string; accountId: string }> {
  if (!state) throw new Error('State OAuth inválido');

  const account = await Automation.findOne({ whatsappOAuthState: state });
  if (!account) throw new Error('State OAuth inválido');

  const result = await connectMetaWithCodeInternal(account, String(account._id), code, state, redirectUri, alertEmail);

  return {
    ...result,
    accountId: String(account._id),
  };
}

export async function initMetaEmbeddedSignup(accountId: string): Promise<{ instanceName: string; state: string; appId: string }> {
  const appId = getMetaAppId();
  const state = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const instanceName = `lyrium_${accountId}`;

  await Automation.findByIdAndUpdate(
    accountId,
    {
      $set: {
        accountId,
        whatsappOAuthState: state,
        whatsappOAuthStateExpires: expires,
        whatsappSession: {
          provider: 'meta',
          instanceName,
          connected: false,
        },
      },
    },
    { upsert: true },
  );

  return { instanceName, state, appId };
}

export async function getInstanceStatus(instanceName: string): Promise<{ connected: boolean; phoneNumber?: string }> {
  const accountId = accountIdFromInstanceName(instanceName);
  const account = await Automation.findById(accountId);
  if (!account) return { connected: false };
  const session = account.whatsappSessions?.find((s: any) => s.connected) || account.whatsappSession;
  if (!session?.phoneNumberId) {
    return { connected: false };
  }

  const token = getSessionToken(account);
  if (!token) return { connected: false };

  try {
    const data = await graphFetchJson<any>(`/${session.phoneNumberId}?fields=display_phone_number`, token);
    const phoneNumber = data?.display_phone_number || session.phoneNumber || '';

    if (!session.connected || session.phoneNumber !== phoneNumber) {
      session.connected = true;
      session.phoneNumber = phoneNumber;
      await account.save();
    }

    return { connected: true, phoneNumber };
  } catch (err) {
    console.error('[WA] getInstanceStatus error:', err);
    if (isTransientMetaStatusError(err)) {
      return {
        connected: !!session.connected,
        phoneNumber: session.phoneNumber || undefined,
      };
    }

    if (session.connected) {
      session.connected = false;
      await account.save();
    }
    return { connected: false, phoneNumber: session.phoneNumber || undefined };
  }
}

export async function getQRCode(_instanceName: string): Promise<string | null> {
  return null;
}

export async function disconnectInstance(instanceName: string): Promise<void> {
  const accountId = accountIdFromInstanceName(instanceName);
  const account = await Automation.findById(accountId);
  if (!account) return;

  account.whatsappSessions = [];
  account.whatsappSession = undefined;
  await account.save();
}

export async function disconnectWhatsApp(accountId: string, phoneNumberId?: string): Promise<void> {
  const account = await Automation.findById(accountId);
  if (!account) return;

  if (phoneNumberId) {
    account.whatsappSessions = (account.whatsappSessions || []).filter((s: any) => s.phoneNumberId !== phoneNumberId);
    const remainingConnected = (account.whatsappSessions || []).find((s: any) => s.connected);
    if (remainingConnected) {
      account.whatsappSession = remainingConnected;
    } else {
      account.whatsappSession = undefined;
    }
  } else {
    account.whatsappSessions = [];
    account.whatsappSession = undefined;
  }
  await account.save();
}

export async function deleteInstance(instanceName: string): Promise<void> {
  await disconnectInstance(instanceName);
}

// ── Send messages ─────────────────────────────────────────────────────
export async function sendTextMessage(instanceName: string, phone: string, text: string, phoneNumberId?: string): Promise<any> {
  const accountId = accountIdFromInstanceName(instanceName);
  const account = await Automation.findById(accountId);
  const session = resolveWhatsAppSession(account, phoneNumberId, instanceName);
  if (!session?.phoneNumberId) throw new Error('WhatsApp Meta no conectado');

  const token = getSessionToken(account, session);
  if (!token) throw new Error('Token Meta inválido');

  const to = sanitizePhone(phone);
  if (!to) throw new Error('Número de destino inválido');

  return graphFetchJson<any>(`/${session.phoneNumberId}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text.substring(0, 4096) },
    }),
  });
}

export async function sendMediaMessage(instanceName: string, phone: string, filePath: string, caption?: string, phoneNumberId?: string): Promise<any> {
  const accountId = accountIdFromInstanceName(instanceName);
  const account = await Automation.findById(accountId);
  const session = resolveWhatsAppSession(account, phoneNumberId, instanceName);
  if (!session?.phoneNumberId) throw new Error('WhatsApp Meta no conectado');

  const token = getSessionToken(account, session);
  if (!token) throw new Error('Token Meta inválido');

  const to = sanitizePhone(phone);
  if (!to) throw new Error('Número de destino inválido');

  const ext = path.extname(filePath).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
  const isVideo = ['.mp4', '.mov', '.avi', '.mkv'].includes(ext);
  const isAudio = ['.mp3', '.ogg', '.wav', '.opus', '.m4a'].includes(ext);

  let type: 'image' | 'video' | 'audio' | 'document' = 'document';
  if (isImage) type = 'image';
  else if (isVideo) type = 'video';
  else if (isAudio) type = 'audio';

  const filename = path.basename(filePath);
  const mediaUrl = buildWAPublicAttachmentUrl(filename);

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type,
  };

  if (type === 'image') payload.image = { link: mediaUrl, caption: caption || '' };
  else if (type === 'video') payload.video = { link: mediaUrl, caption: caption || '' };
  else if (type === 'audio') payload.audio = { link: mediaUrl };
  else payload.document = { link: mediaUrl, caption: caption || '', filename };

  return graphFetchJson<any>(`/${session.phoneNumberId}/messages`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function persistOutgoingWhatsAppMessage(
  accountId: string,
  conversationId: string | undefined,
  phone: string,
  text: string,
  attachments: WAOutgoingAttachment[] = [],
): Promise<void> {
  await withAccountLock(accountId, async () => {
    const account = await Automation.findById(accountId);
    if (!account) throw new Error('Cuenta no encontrada');

    const now = new Date().toISOString();
    let conv = account.whatsappConversations.find((c: any) => c.id === conversationId || c.contactPhone === phone);
    if (!conv) {
      conv = {
        id: conversationId || createWAId('waconv'),
        contactName: phone,
        contactPhone: phone,
        messages: [],
        lastMessageTime: now,
        unread: 0,
        autoReplyPaused: false,
      };
      account.whatsappConversations.push(conv as any);
    }

    if (text) {
      conv.messages.push({
        id: createWAId('wa_sent'),
        from: 'me',
        text,
        time: now,
        sent: true,
      });
    }

    for (const attachment of attachments) {
      conv.messages.push({
        id: createWAId('wa_sent_file'),
        from: 'me',
        text: `[${attachment.originalName}]`,
        time: now,
        sent: true,
        attachments: [{
          id: createWAId('wa_att'),
          filename: attachment.filename,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
        }],
      });
    }

    conv.lastMessageTime = now;
    await account.save();
  });
}

export async function rollbackOutgoingWhatsAppMessage(
  accountId: string,
  conversationId: string | undefined,
  phone: string,
  text: string,
  attachments: WAOutgoingAttachment[] = [],
): Promise<void> {
  await withAccountLock(accountId, async () => {
    const account = await Automation.findById(accountId);
    if (!account) return;
    const conv = account.whatsappConversations.find((c: any) => c.id === conversationId || c.contactPhone === phone);
    if (!conv) return;

    // Remove the last messages that match this exact outgoing batch
    const removeCount = (text ? 1 : 0) + attachments.length;
    if (removeCount > 0 && conv.messages.length >= removeCount) {
      conv.messages.splice(conv.messages.length - removeCount, removeCount);
    }
    await account.save();
  });
}

export async function markConversationRead(accountId: string, conversationId: string): Promise<boolean> {
  return withAccountLock(accountId, async () => {
    const account = await Automation.findById(accountId);
    if (!account) return false;

    const conv = account.whatsappConversations.find((c: any) => c.id === conversationId);
    if (!conv) return false;

    conv.unread = 0;
    await account.save();
    return true;
  });
}

export async function toggleConversationAutoReply(accountId: string, conversationId: string): Promise<boolean | null> {
  return withAccountLock(accountId, async () => {
    const account = await Automation.findById(accountId);
    if (!account) return null;

    const conv = account.whatsappConversations.find((c: any) => c.id === conversationId);
    if (!conv) return null;

    conv.autoReplyPaused = !conv.autoReplyPaused;
    await account.save();
    return !!conv.autoReplyPaused;
  });
}

// ── Token management ─────────────────────────────────────────────────
export async function refreshWhatsAppToken(
  accountId: string,
  phoneNumberId: string,
): Promise<{ success: boolean; newExpiresAt?: string; daysRemaining?: number; error?: string }> {
  try {
    const account = await Automation.findById(accountId);
    if (!account) return { success: false, error: 'Cuenta no encontrada' };

    const session = (account.whatsappSessions || []).find(
      (s: any) => s.phoneNumberId === phoneNumberId
    );

    if (!session) return { success: false, error: 'Sesión no encontrada' };
    if (!session.accessToken) return { success: false, error: 'No hay token de acceso' };

    const appId = getMetaAppId();
    const appSecret = getMetaAppSecret();

    if (!appId || !appSecret) {
      return { success: false, error: 'Meta App ID o Secret no configurados' };
    }

    const exchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token`;
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: decryptPassword(session.accessToken),
    });

    const response = await fetch(`${exchangeUrl}?${params.toString()}`);
    const data = await response.json();

    if (!response.ok || data.error) {
      return { success: false, error: data.error?.message || 'No se pudo renovar el token' };
    }

    const newToken = data.access_token;
    const expiresIn = data.expires_in || 5184000;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    session.accessToken = encryptPassword(newToken);
    session.tokenExpiresAt = newExpiresAt;
    session.tokenType = 'long';

    await account.save();

    const daysRemaining = Math.floor((new Date(newExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    return { success: true, newExpiresAt, daysRemaining };
  } catch (err: any) {
    console.error('[WA] Error renovando token:', err);
    return { success: false, error: err.message || 'Error desconocido' };
  }
}

export async function getTokenStatus(
  accountId: string,
  phoneNumberId: string,
): Promise<{
  phoneNumberId: string;
  connected: boolean;
  tokenType: string;
  expiresAt: string;
  daysRemaining: number;
  status: 'ok' | 'warning' | 'critical' | 'expired' | 'unknown';
  alertEmail?: string;
  expiryKnown?: boolean;
  connectionStatus?: string;
  lastValidatedAt?: string;
  lastValidationError?: string;
} | null> {
  const account = await Automation.findById(accountId);
  if (!account) return null;

  const session = (account.whatsappSessions || []).find(
    (s: any) => s.phoneNumberId === phoneNumberId
  );

  if (!session) return null;

  let daysRemaining = 999;
  let status: 'ok' | 'warning' | 'critical' | 'expired' | 'unknown' = session.expiryKnown ? 'ok' : 'unknown';

  if (session.expiryKnown && session.tokenExpiresAt) {
    const expiresAt = new Date(session.tokenExpiresAt).getTime();
    const now = Date.now();
    daysRemaining = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) status = 'expired';
    else if (daysRemaining <= 7) status = 'critical';
    else if (daysRemaining <= 14) status = 'warning';
    else status = 'ok';
  }

  return {
    phoneNumberId: session.phoneNumberId || '',
    connected: session.connected,
    tokenType: session.tokenType || 'unknown',
    expiresAt: session.tokenExpiresAt || '',
    daysRemaining,
    status,
    alertEmail: session.alertEmail,
    expiryKnown: session.expiryKnown === true,
    connectionStatus: session.connectionStatus || 'disconnected',
    lastValidatedAt: session.lastValidatedAt || '',
    lastValidationError: session.lastValidationError || '',
  };
}

// ── Process incoming webhook payload (Meta) ──────────────────────────
export async function processIncomingMessage(phoneNumberId: string, data: any): Promise<void> {
  const value = data?.messages ? data : data?.value || data?.data || data;
  const messages = Array.isArray(value?.messages) ? value.messages : [];
  if (!phoneNumberId || messages.length === 0) return;

  const account = await findAccountByPhoneNumberId(phoneNumberId);
  if (!account) {
    console.warn('[WA] Webhook message ignored: no account for phone_number_id', phoneNumberId);
    return;
  }

  for (const msg of messages) {
    try {
      await processOneIncomingMetaMessageUnified(account._id, phoneNumberId, value, msg);
    } catch (err) {
      console.error('[WA] Error processing incoming message', err);
    }
  }
}

export async function processConnectionUpdate(_instanceName: string, _data: any): Promise<void> {
  // Meta Cloud API does not send Evolution-like connection updates here.
}

// ── Export attachments dir for controller ─────────────────────────────
export { WA_ATTACHMENTS_DIR };
