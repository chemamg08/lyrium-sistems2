import type { RequestHandler, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Automation } from '../models/Automation.js';
import { verifyOwnership, type AuthRequest } from '../middleware/auth.js';
import * as waService from '../services/whatsappService.js';

const REQUIRED_META_CONNECT_ENV = [
  'WHATSAPP_META_APP_ID',
  'WHATSAPP_META_APP_SECRET',
  'WHATSAPP_META_WEBHOOK_VERIFY_TOKEN',
  'BACKEND_PUBLIC_URL',
] as const;

const RECOMMENDED_META_ENV = [
  'WHATSAPP_META_REDIRECT_URI',
  'FRONTEND_URL',
] as const;

function getMissingEnvVars(names: readonly string[]): string[] {
  return names.filter((name) => !String(process.env[name] || '').trim());
}

function isValidAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getInvalidRequiredEnvVars(): string[] {
  const invalid: string[] = [];
  const backendPublicUrl = String(process.env.BACKEND_PUBLIC_URL || '').trim();
  if (backendPublicUrl && !isValidAbsoluteHttpUrl(backendPublicUrl)) {
    invalid.push('BACKEND_PUBLIC_URL');
  }
  return invalid;
}

function getMetaConfigIssues(): string[] {
  return [...new Set([...getMissingEnvVars(REQUIRED_META_CONNECT_ENV), ...getInvalidRequiredEnvVars()])];
}

function sendMetaConfigError(res: any): void {
  const missingRequired = getMetaConfigIssues();
  const missingRecommended = getMissingEnvVars(RECOMMENDED_META_ENV);

  res.status(500).json({
    error: `Faltan o son inválidas variables de entorno para WhatsApp Meta: ${missingRequired.join(', ')}`,
    missingEnv: missingRequired,
    recommendedMissingEnv: missingRecommended,
  });
}

function stripTrailingSlash(value: string): string {
  return String(value || '').replace(/\/+$/, '');
}

function getForwardedHeader(value: unknown): string {
  return String(value || '').split(',')[0].trim();
}

function getPublicBackendBaseUrl(req: any): string {
  const proto = getForwardedHeader(req.headers?.['x-forwarded-proto']) || req.protocol || 'https';
  const host = getForwardedHeader(req.headers?.['x-forwarded-host']) || req.get?.('host') || '';
  if (host) return `${proto}://${host}`;
  return stripTrailingSlash(process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`);
}

function getMetaCallbackUrl(req: any): string {
  return `${stripTrailingSlash(getPublicBackendBaseUrl(req))}/api/whatsapp/meta/callback`;
}

function getFrontendAutomationsUrl(): string {
  const frontend = stripTrailingSlash(process.env.FRONTEND_URL || 'http://localhost:8080');
  return `${frontend}/automatizaciones`;
}

function cleanupUploadedFiles(files?: Express.Multer.File[]): void {
  for (const file of files || []) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Ignore cleanup errors for temporary uploaded files.
    }
  }
}

function getWebhookRawBody(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body;
  return Buffer.from(JSON.stringify(body || {}), 'utf8');
}

function isValidMetaWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
  const appSecret = String(process.env.WHATSAPP_META_APP_SECRET || '').trim();
  if (!appSecret || !signatureHeader) return false;

  const receivedSignature = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;
  const expectedSignature = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(receivedSignature, 'hex'));
  } catch {
    return false;
  }
}

function buildMetaResultUrl(status: 'connected' | 'error', message?: string): string {
  const params = new URLSearchParams({
    wa_meta: '1',
    wa_status: status,
  });

  const cleanMessage = String(message || '').trim();
  if (cleanMessage) {
    params.set('wa_message', cleanMessage.slice(0, 500));
  }

  return `${getFrontendAutomationsUrl()}?${params.toString()}`;
}

// ── Multer for WhatsApp attachments ──────────────────────────────────
const waUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, waService.WA_ATTACHMENTS_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
  }),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const forbidden = /\.(exe|bat|cmd|ps1|sh)$/i;
    cb(null, !forbidden.test(file.originalname));
  },
});
export const waAttachmentMiddleware = waUpload;

async function getAccount(accountId: string) {
  return Automation.findById(accountId);
}

// ── Meta connect flow ────────────────────────────────────────────────
export const connectWhatsApp: RequestHandler = async (req, res) => {
  try {
    const { accountId } = req.body;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const missingRequired = getMetaConfigIssues();
    if (missingRequired.length > 0) {
      sendMetaConfigError(res);
      return;
    }

    const result = await waService.initMetaEmbeddedSignup(accountId);
    const configId = process.env.WHATSAPP_META_CONFIG_ID || null;
    res.json({ ok: true, ...result, configId });
  } catch (err: any) {
    console.error('[WA] connectWhatsApp error:', err);
    res.status(500).json({ error: err.message });
  }
};

export const connectWhatsAppWithCode: RequestHandler = async (req, res) => {
  try {
    const { accountId, code, state } = req.body;
    if (!accountId || !code || !state) {
      res.status(400).json({ error: 'accountId, code y state requeridos' });
      return;
    }
    if (!verifyOwnership(req as AuthRequest, accountId)) {
      res.status(403).json({ error: 'Acceso denegado' });
      return;
    }

    const missingRequired = getMetaConfigIssues();
    if (missingRequired.length > 0) {
      sendMetaConfigError(res);
      return;
    }

    // No redirectUri → Embedded Signup flow (redirect_uri omitted in token exchange)
    const data = await waService.connectMetaWithCode(accountId, code, state);
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[WA] connectWhatsAppWithCode error:', err);
    res.status(500).json({ error: err.message || 'Error conectando WhatsApp con Meta' });
  }
};

export const connectWhatsAppWithToken: RequestHandler = async (req, res) => {
  try {
    const { accountId, state, accessToken, name, alertEmail } = req.body;
    if (!accountId || !state || !accessToken) {
      res.status(400).json({ error: 'accountId, state y accessToken requeridos' });
      return;
    }
    if (!verifyOwnership(req as AuthRequest, accountId)) {
      res.status(403).json({ error: 'Acceso denegado' });
      return;
    }

    const missingRequired = getMissingEnvVars(REQUIRED_META_CONNECT_ENV);
    if (missingRequired.length > 0) {
      sendMetaConfigError(res);
      return;
    }

    const data = await waService.connectMetaWithToken(accountId, state, accessToken, name, alertEmail);
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[WA] connectWhatsAppWithToken error:', err);
    res.status(500).json({ error: err.message || 'Error conectando WhatsApp con Meta' });
  }
};

export const connectWhatsAppManual: RequestHandler = async (req, res) => {
  try {
    const { accountId, accessToken, phoneNumberId, wabaId, name, alertEmail } = req.body;
    const missingRequired = getMetaConfigIssues();
    if (!accountId || !accessToken || !phoneNumberId) {
      res.status(400).json({ error: 'accountId, accessToken y phoneNumberId requeridos' });
      return;
    }
    if (!verifyOwnership(req as AuthRequest, accountId)) {
      res.status(403).json({ error: 'Acceso denegado' });
      return;
    }
    if (missingRequired.length > 0) {
      sendMetaConfigError(res);
      return;
    }
    const data = await waService.connectMetaManual(accountId, accessToken, phoneNumberId, wabaId, name, alertEmail);
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[WA] connectWhatsAppManual error:', err);
    res.status(500).json({ error: err.message || 'Error conectando WhatsApp manualmente' });
  }
};

export const whatsappMetaCallback: RequestHandler = async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const error = String(req.query.error || '');
    const errorDescription = String(req.query.error_description || '');

    if (error) {
      const message = errorDescription || `Meta devolvió un error: ${error}`;
      res.redirect(buildMetaResultUrl('error', message));
      return;
    }

    if (!code || !state) {
      res.redirect(buildMetaResultUrl('error', 'Meta no devolvió code/state válidos.'));
      return;
    }

    const missingRequired = getMetaConfigIssues();
    if (missingRequired.length > 0) {
      res.redirect(buildMetaResultUrl('error', `Faltan o son inválidas variables de entorno para WhatsApp Meta: ${missingRequired.join(', ')}`));
      return;
    }

    const redirectUri = getMetaCallbackUrl(req);
    await waService.connectMetaWithCodeByState(code, state, redirectUri);

    res.redirect(buildMetaResultUrl('connected'));
  } catch (err: any) {
    console.error('[WA] whatsappMetaCallback error:', err);
    res.redirect(buildMetaResultUrl('error', String(err?.message || 'No fue posible finalizar la conexion con Meta.')));
  }
};

export const getWhatsAppStatus: RequestHandler = async (req, res) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    const sessions = account?.whatsappSessions || [];
    const legacySession = account?.whatsappSession;

    const instanceName = legacySession?.instanceName || `lyrium_${accountId}`;
    const status = await waService.getInstanceStatus(instanceName);

    res.json({
      connected: sessions.some((s: any) => s.connected) || status.connected,
      whatsappSessions: sessions.map((s: any) => ({
        id: s.phoneNumberId || s.instanceName,
        phoneNumberId: s.phoneNumberId || '',
        name: s.name || `WhatsApp ${s.phoneNumber || ''}`,
        phoneNumber: s.phoneNumber || '',
        connected: s.connected,
        connectedAt: s.connectedAt,
        provider: s.provider || 'meta',
        tokenType: s.tokenType,
        tokenExpiresAt: s.tokenExpiresAt,
        alertEmail: s.alertEmail || '',
        credentialMode: s.credentialMode || '',
        expiryKnown: s.expiryKnown === true,
        connectionStatus: s.connectionStatus || 'disconnected',
        lastValidatedAt: s.lastValidatedAt || '',
        lastValidationError: s.lastValidationError || '',
      })),
      legacySession: legacySession ? {
        phoneNumber: legacySession.phoneNumber || '',
        connected: legacySession.connected,
      } : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const disconnectWhatsApp: RequestHandler = async (req, res) => {
  try {
    const { accountId, phoneNumberId } = req.body;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

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

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── Auto-reply and selection settings ────────────────────────────────
export const updateWhatsAppSwitch: RequestHandler = async (req, res) => {
  try {
    const { accountId, enabled } = req.body;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    await Automation.findByIdAndUpdate(accountId, { $set: { whatsappSwitchActivo: !!enabled, accountId } }, { upsert: true });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const updateWhatsAppSelection: RequestHandler = async (req, res) => {
  try {
    const {
      accountId,
      respondConsultasGenerales,
      respondSolicitudesServicio,
      soloContactosConocidos,
    } = req.body;

    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const update: Record<string, boolean> = {};
    if (typeof respondConsultasGenerales === 'boolean') update.whatsappRespondConsultasGenerales = respondConsultasGenerales;
    if (typeof respondSolicitudesServicio === 'boolean') update.whatsappRespondSolicitudesServicio = respondSolicitudesServicio;
    if (typeof soloContactosConocidos === 'boolean') update.whatsappSoloContactosConocidos = soloContactosConocidos;

    await Automation.findByIdAndUpdate(accountId, { $set: { ...update, accountId } }, { upsert: true });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── Conversations ────────────────────────────────────────────────────
export const getWhatsAppConversations: RequestHandler = async (req, res) => {
  try {
    const accountId = req.query.accountId as string;
    const phoneNumberId = req.query.phoneNumberId as string;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    let conversations = account?.whatsappConversations || [];
    if (phoneNumberId) {
      conversations = conversations.filter((c: any) => c.phoneNumberId === phoneNumberId);
    }

    res.json({
      conversations,
      folders: account?.whatsappFolders || [],
      switchActivo: account?.whatsappSwitchActivo || false,
      connected: account?.whatsappSession?.connected || false,
      correosConsultas: account?.correosConsultas || account?.whatsappCorreosConsultas || [],
      selection: {
        respondConsultasGenerales: account?.whatsappRespondConsultasGenerales !== false,
        respondSolicitudesServicio: account?.whatsappRespondSolicitudesServicio !== false,
        soloContactosConocidos: account?.whatsappSoloContactosConocidos === true,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const markWhatsAppRead: RequestHandler = async (req, res) => {
  try {
    const { accountId, conversationId } = req.body;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const updated = await waService.markConversationRead(accountId, conversationId);
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const toggleWhatsAppAutoReply: RequestHandler = async (req, res) => {
  try {
    const { accountId } = req.body;
    const conversationId = req.params.id;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const autoReplyPaused = await waService.toggleConversationAutoReply(accountId, conversationId);
    if (autoReplyPaused === null) { res.status(404).json({ error: 'Not found' }); return; }

    res.json({ ok: true, autoReplyPaused });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteWhatsAppConversation: RequestHandler = async (req, res) => {
  try {
    const { accountId } = req.body;
    const conversationId = req.params.id;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    await Automation.findByIdAndUpdate(accountId, {
      $pull: { whatsappConversations: { id: conversationId } } as any,
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── Send manual message ──────────────────────────────────────────────
export const sendWhatsAppMessage: RequestHandler = async (req, res) => {
  let files: Express.Multer.File[] | undefined;
  try {
    const { accountId, phone, text } = req.body;
    const conversationId = req.params.id;
    files = req.files as Express.Multer.File[] | undefined;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const conversation = (account.whatsappConversations || []).find((c: any) => c.id === conversationId || c.contactPhone === phone);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const conversationPhoneNumberId = conversation.phoneNumberId;
    if (!conversationPhoneNumberId) {
      res.status(400).json({ error: 'Esta conversación no tiene un número de WhatsApp asignado' });
      return;
    }

    const session = (account.whatsappSessions || []).find((s: any) => s.phoneNumberId === conversationPhoneNumberId);
    if (!session?.connected) {
      res.status(400).json({ error: 'WhatsApp not connected for this number' });
      return;
    }

    const instanceName = session.instanceName || `lyrium_${accountId}`;

    if (waService.isWhatsAppConversationOutside24h(conversation)) {
      res.status(409).json({ error: 'Meta bloquea mensajes libres fuera de 24 horas. El cliente debe volver a escribir para reabrir la ventana.' });
      return;
    }

    if (!String(text || '').trim() && (!files || files.length === 0)) {
      res.status(400).json({ error: 'Text or files required' });
      return;
    }

    // instanceName ya definido arriba

    const outgoingAttachments = (files || []).map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    }));
    let sentText = false;
    let sentAttachmentCount = 0;

    try {
      if (text) {
        await waService.sendTextMessage(instanceName, phone, text, conversationPhoneNumberId);
        await waService.persistOutgoingWhatsAppMessage(accountId, conversationId, phone, text, []);
        sentText = true;
      }

      if (files && files.length > 0) {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          const attachmentMeta = outgoingAttachments[index];
          await waService.sendMediaMessage(instanceName, phone, file.path, '', conversationPhoneNumberId);
          await waService.persistOutgoingWhatsAppMessage(accountId, conversationId, phone, '', attachmentMeta ? [attachmentMeta] : []);
          sentAttachmentCount += 1;
        }
      }
    } catch (sendErr: any) {
      const partial = sentText || sentAttachmentCount > 0;
      res.status(partial ? 207 : 502).json({
        ok: partial,
        partial,
        sentText,
        sentAttachments: sentAttachmentCount,
        error: 'Error enviando mensaje por WhatsApp: ' + sendErr.message,
      });
      return;
    }

    res.json({ ok: true, sentText, sentAttachments: sentAttachmentCount });
  } catch (err: any) {
    console.error('[WA] sendWhatsAppMessage error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    cleanupUploadedFiles(files);
  }
};

// ── Folders ──────────────────────────────────────────────────────────
export const createWhatsAppFolder: RequestHandler = async (req, res) => {
  try {
    const { accountId, name, color } = req.body;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const folder = { id: `wafolder_${Date.now()}`, name, color: color || '#6366f1', conversationIds: [] };

    await Automation.findByIdAndUpdate(accountId, {
      $push: { whatsappFolders: folder },
      $set: { accountId },
    }, { upsert: true });

    res.json({ ok: true, folder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteWhatsAppFolder: RequestHandler = async (req, res) => {
  try {
    const { accountId } = req.body;
    const folderId = req.params.id;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    await Automation.findByIdAndUpdate(accountId, {
      $pull: { whatsappFolders: { id: folderId } } as any,
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const assignConversationToWAFolder: RequestHandler = async (req, res) => {
  try {
    const { accountId, folderId, conversationId } = req.body;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    if (!account) { res.status(404).json({ error: 'Not found' }); return; }

    const folder = account.whatsappFolders.find((f: any) => f.id === folderId);
    if (folder && !folder.conversationIds.includes(conversationId)) {
      folder.conversationIds.push(conversationId);
      await account.save();
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const removeConversationFromWAFolder: RequestHandler = async (req, res) => {
  try {
    const { accountId, folderId, conversationId } = req.body;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    if (!account) { res.status(404).json({ error: 'Not found' }); return; }

    const folder = account.whatsappFolders.find((f: any) => f.id === folderId);
    if (folder) {
      folder.conversationIds = folder.conversationIds.filter((id: string) => id !== conversationId);
      await account.save();
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── WhatsApp query emails (separate from Email automation) ──────────
export const createWhatsappCorreoConsulta: RequestHandler = async (req, res) => {
  try {
    const { accountId, email } = req.body;
    if (!accountId || !email) { res.status(400).json({ error: 'accountId y email requeridos' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const normalized = String(email).trim().toLowerCase();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!isEmail) { res.status(400).json({ error: 'Email inválido' }); return; }

    const account = await getAccount(accountId);
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

    const list = Array.from(new Set([...(account.correosConsultas || []), ...(account.whatsappCorreosConsultas || [])]));
    if (list.length >= 1 && !list.includes(normalized)) {
      res.status(409).json({ error: 'Solo se permite un correo de consulta por workspace' });
      return;
    }
    if (!list.includes(normalized)) list.push(normalized);
    account.correosConsultas = list.slice(0, 1);
    account.whatsappCorreosConsultas = [];
    await account.save();

    res.json({ ok: true, correosConsultas: account.correosConsultas });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteWhatsappCorreoConsulta: RequestHandler = async (req, res) => {
  try {
    const { accountId, email } = req.body;
    if (!accountId || !email) { res.status(400).json({ error: 'accountId y email requeridos' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const normalized = String(email).trim().toLowerCase();
    const account = await getAccount(accountId);
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

    account.correosConsultas = (account.correosConsultas || []).filter((e: string) => e !== normalized);
    account.whatsappCorreosConsultas = (account.whatsappCorreosConsultas || []).filter((e: string) => e !== normalized);
    await account.save();

    res.json({ ok: true, correosConsultas: account.correosConsultas });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── WhatsApp classify rules ──────────────────────────────────────────
export const getWhatsAppClassifyRules: RequestHandler = async (req, res) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    res.json({ rules: account?.whatsappClassifyRules || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const createWhatsAppClassifyRule: RequestHandler = async (req, res) => {
  try {
    const { accountId, name, description, folderIds } = req.body;
    if (!accountId || !name?.trim() || !description?.trim() || !Array.isArray(folderIds) || folderIds.length === 0) {
      res.status(400).json({ error: 'accountId, name, description y folderIds requeridos' });
      return;
    }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

    const rule = {
      id: Date.now().toString(),
      name: String(name).trim(),
      description: String(description).trim(),
      folderIds,
      createdAt: new Date().toISOString(),
    };

    const list = account.whatsappClassifyRules || [];
    list.push(rule as any);
    account.whatsappClassifyRules = list;
    await account.save();

    res.json({ ok: true, rule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteWhatsAppClassifyRule: RequestHandler = async (req, res) => {
  try {
    const accountId = req.query.accountId as string;
    const { id } = req.params;
    if (!accountId || !id) { res.status(400).json({ error: 'accountId e id requeridos' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

    account.whatsappClassifyRules = (account.whatsappClassifyRules || []).filter((r: any) => r.id !== id);
    await account.save();

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

function resolveWAAttachmentPath(filename: string): string | null {
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }

  const filePath = path.join(waService.WA_ATTACHMENTS_DIR, filename);
  return fs.existsSync(filePath) ? filePath : null;
}

export const serveWAPublicAttachment: RequestHandler = async (req, res) => {
  try {
    const filename = String(req.params.filename || '');
    const expiresAt = Number(req.query.exp || 0);
    const signature = String(req.query.sig || '');

    if (!waService.isValidWAPublicAttachmentSignature(filename, expiresAt, signature)) {
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    const filePath = resolveWAAttachmentPath(filename);
    if (!filePath) { res.status(404).json({ error: 'File not found' }); return; }
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── Serve WhatsApp attachment files ──────────────────────────────────
export const serveWAAttachment: RequestHandler = async (req, res) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const filename = String(req.params.filename || '');
    const account = await getAccount(accountId);
    const conversations = account?.whatsappConversations || [];
    let found = false;
    for (const conv of conversations) {
      for (const msg of conv.messages || []) {
        for (const att of msg.attachments || []) {
          if (att.filename === filename) { found = true; break; }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) { res.status(404).json({ error: 'File not found' }); return; }

    const filePath = resolveWAAttachmentPath(filename);
    if (!filePath) { res.status(404).json({ error: 'File not found' }); return; }
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── Webhook verify (GET) and events (POST) ──────────────────────────
export const whatsappWebhookVerify: RequestHandler = async (req, res) => {
  try {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    const expected = process.env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN || '';
    if (mode === 'subscribe' && token && expected && token === expected) {
      res.status(200).send(challenge || '');
      return;
    }

    res.status(403).send('Forbidden');
  } catch {
    res.status(403).send('Forbidden');
  }
};

export const whatsappWebhook: RequestHandler = async (req, res) => {
  try {
    const appSecret = String(process.env.WHATSAPP_META_APP_SECRET || '').trim();
    if (!appSecret) {
      res.status(500).json({ error: 'WhatsApp Meta webhook not configured' });
      return;
    }

    const rawBody = getWebhookRawBody(req.body);
    const signatureHeader = String(req.headers['x-hub-signature-256'] || '');
    if (!isValidMetaWebhookSignature(rawBody, signatureHeader)) {
      res.status(403).json({ error: 'Invalid WhatsApp webhook signature' });
      return;
    }

    const rawText = rawBody.toString('utf8').trim();
    const body = rawText ? JSON.parse(rawText) : {};
    const entries = Array.isArray(body?.entry) ? body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const field = change?.field;
        const value = change?.value;
        if (field !== 'messages' || !value) continue;

        const phoneNumberId = value?.metadata?.phone_number_id || '';
        if (!phoneNumberId) continue;

        if (Array.isArray(value?.messages) && value.messages.length > 0) {
          await waService.processIncomingMessage(phoneNumberId, value);
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[WA] Webhook error:', err);
    res.json({ ok: true });
  }
};

// ── Unread count ─────────────────────────────────────────────────────
export const getWhatsAppUnreadCount: RequestHandler = async (req, res) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    const total = (account?.whatsappConversations || []).reduce((sum: number, c: any) => sum + (c.unread || 0), 0);
    res.json({ unread: total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── Token management ─────────────────────────────────────────────────
export async function refreshWhatsAppToken(req: AuthRequest, res: Response) {
  try {
    const { accountId, phoneNumberId } = req.body;

    if (!accountId || !phoneNumberId) {
      return res.status(400).json({ error: 'accountId y phoneNumberId son requeridos' });
    }

    if (!verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const result = await waService.refreshWhatsAppToken(accountId, phoneNumberId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      newExpiresAt: result.newExpiresAt,
      daysRemaining: result.daysRemaining,
    });
  } catch (err: any) {
    console.error('[WA] Error en refresh-token:', err);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
}

export async function getTokenStatus(req: AuthRequest, res: Response) {
  try {
    const { accountId } = req.query;
    const { phoneNumberId } = req.query;

    if (!accountId || !phoneNumberId) {
      return res.status(400).json({ error: 'accountId y phoneNumberId son requeridos' });
    }

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const status = await waService.getTokenStatus(accountId as string, phoneNumberId as string);

    if (!status) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    res.json(status);
  } catch (err: any) {
    console.error('[WA] Error en token-status:', err);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
}
