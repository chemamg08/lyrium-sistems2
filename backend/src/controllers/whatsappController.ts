import type { RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Automation } from '../models/Automation.js';
import { verifyOwnership, type AuthRequest } from '../middleware/auth.js';
import * as waService from '../services/whatsappService.js';

const REQUIRED_META_CONNECT_ENV = [
  'WHATSAPP_META_APP_ID',
  'WHATSAPP_META_APP_SECRET',
] as const;

const RECOMMENDED_META_ENV = [
  'WHATSAPP_META_REDIRECT_URI',
  'WHATSAPP_META_WEBHOOK_VERIFY_TOKEN',
  'BACKEND_PUBLIC_URL',
  'FRONTEND_URL',
] as const;

function getMissingEnvVars(names: readonly string[]): string[] {
  return names.filter((name) => !String(process.env[name] || '').trim());
}

function sendMetaConfigError(res: any): void {
  const missingRequired = getMissingEnvVars(REQUIRED_META_CONNECT_ENV);
  const missingRecommended = getMissingEnvVars(RECOMMENDED_META_ENV);

  res.status(500).json({
    error: `Faltan variables de entorno para WhatsApp Meta: ${missingRequired.join(', ')}`,
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

    const missingRequired = getMissingEnvVars(REQUIRED_META_CONNECT_ENV);
    if (missingRequired.length > 0) {
      sendMetaConfigError(res);
      return;
    }

    const redirectUri = `${getFrontendAutomationsUrl()}?wa_meta=1`;
    const result = await waService.createInstance(accountId, redirectUri);
    res.json({ ok: true, instanceName: result.instanceName, authUrl: result.authUrl, redirectUri });
  } catch (err: any) {
    console.error('[WA] connectWhatsApp error:', err);
    res.status(500).json({ error: err.message });
  }
};

export const connectWhatsAppWithCode: RequestHandler = async (req, res) => {
  try {
    const { accountId, code, state, redirectUri } = req.body;
    if (!accountId || !code || !state) {
      res.status(400).json({ error: 'accountId, code y state requeridos' });
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

    const data = await waService.connectMetaWithCode(accountId, code, state, redirectUri);
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[WA] connectWhatsAppWithCode error:', err);
    res.status(500).json({ error: err.message || 'Error conectando WhatsApp con Meta' });
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

    const missingRequired = getMissingEnvVars(REQUIRED_META_CONNECT_ENV);
    if (missingRequired.length > 0) {
      res.redirect(buildMetaResultUrl('error', `Faltan variables de entorno para WhatsApp Meta: ${missingRequired.join(', ')}`));
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
    const instanceName = account?.whatsappSession?.instanceName || `lyrium_${accountId}`;

    const status = await waService.getInstanceStatus(instanceName);
    res.json({
      connected: status.connected,
      instanceName,
      phoneNumber: status.phoneNumber || account?.whatsappSession?.phoneNumber || '',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const disconnectWhatsApp: RequestHandler = async (req, res) => {
  try {
    const { accountId } = req.body;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const instanceName = `lyrium_${accountId}`;
    await waService.disconnectInstance(instanceName);

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
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    res.json({
      conversations: account?.whatsappConversations || [],
      folders: account?.whatsappFolders || [],
      switchActivo: account?.whatsappSwitchActivo || false,
      connected: account?.whatsappSession?.connected || false,
      correosConsultas: account?.whatsappCorreosConsultas || [],
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

    const account = await getAccount(accountId);
    if (!account) { res.status(404).json({ error: 'Not found' }); return; }

    const conv = account.whatsappConversations.find((c: any) => c.id === conversationId);
    if (conv) {
      conv.unread = 0;
      await account.save();
    }

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

    const account = await getAccount(accountId);
    if (!account) { res.status(404).json({ error: 'Not found' }); return; }

    const conv = account.whatsappConversations.find((c: any) => c.id === conversationId);
    if (conv) {
      conv.autoReplyPaused = !conv.autoReplyPaused;
      await account.save();
    }

    res.json({ ok: true, autoReplyPaused: conv?.autoReplyPaused });
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
  try {
    const { accountId, phone, text } = req.body;
    const conversationId = req.params.id;
    if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }
    if (!verifyOwnership(req as AuthRequest, accountId)) { res.status(403).json({ error: 'Acceso denegado' }); return; }

    const account = await getAccount(accountId);
    if (!account?.whatsappSession?.instanceName || !account.whatsappSession.connected) {
      res.status(400).json({ error: 'WhatsApp not connected' });
      return;
    }

    const instanceName = account.whatsappSession.instanceName;

    if (text) {
      await waService.sendTextMessage(instanceName, phone, text);
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      for (const file of files) {
        await waService.sendMediaMessage(instanceName, phone, file.path, '');
      }
    }

    const now = new Date().toISOString();
    let conv = account.whatsappConversations.find((c: any) => c.id === conversationId || c.contactPhone === phone);
    if (!conv) {
      conv = {
        id: conversationId || `waconv_${Date.now()}`,
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
        id: `wa_sent_${Date.now()}`,
        from: 'me',
        text,
        time: now,
        sent: true,
      });
    }

    if (files && files.length > 0) {
      for (const file of files) {
        conv.messages.push({
          id: `wa_sent_file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          from: 'me',
          text: `[${file.originalname}]`,
          time: now,
          sent: true,
          attachments: [{
            id: `wa_att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
          }],
        });
      }
    }

    conv.lastMessageTime = now;
    await account.save();

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[WA] sendWhatsAppMessage error:', err);
    res.status(500).json({ error: err.message });
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

    const list = account.whatsappCorreosConsultas || [];
    if (!list.includes(normalized)) list.push(normalized);
    account.whatsappCorreosConsultas = list;
    await account.save();

    res.json({ ok: true, correosConsultas: list });
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

    account.whatsappCorreosConsultas = (account.whatsappCorreosConsultas || []).filter((e: string) => e !== normalized);
    await account.save();

    res.json({ ok: true, correosConsultas: account.whatsappCorreosConsultas });
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

// ── Serve WhatsApp attachment files ──────────────────────────────────
export const serveWAAttachment: RequestHandler = async (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    const filePath = path.join(waService.WA_ATTACHMENTS_DIR, filename);
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found' }); return; }
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
    const body = req.body;
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
