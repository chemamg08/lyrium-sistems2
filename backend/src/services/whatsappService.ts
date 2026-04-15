import OpenAI from 'openai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AI_MODEL } from '../config/aiModel.js';
import { Automation } from '../models/Automation.js';
import { sendEmailViaCuenta, type CuentaCorreoConfig } from './emailService.js';
import { decryptPassword, encryptPassword } from './emailProcessorService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const META_API_VERSION = process.env.WHATSAPP_META_API_VERSION || 'v22.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const BACKEND_URL = stripTrailingSlash(process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`);
const WA_ATTACHMENTS_DIR = path.join(__dirname, '../../uploads/wa-attachments');

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
  return process.env.WHATSAPP_META_REDIRECT_URI || `${BACKEND_URL}/api/whatsapp/meta/callback`;
}

function accountIdFromInstanceName(instanceName: string): string {
  return instanceName.startsWith('lyrium_') ? instanceName.slice('lyrium_'.length) : instanceName;
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
  return Automation.findOne({ 'whatsappSession.phoneNumberId': phoneNumberId });
}

function getSessionToken(account: any): string {
  const encrypted = account?.whatsappSession?.accessToken || '';
  return decryptPassword(encrypted);
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

async function classifyWhatsAppMessage(
  body: string,
  historyContext = '',
): Promise<{ type: 'consulta_general' | 'solicitud_servicio' | 'otro' }> {
  try {
    const prompt = `Clasifica este mensaje de WhatsApp del cliente en una de estas 3 categorias:\n\n1. "consulta_general" — pregunta general, solicitud de informacion, dudas sobre servicios/precios/horarios/disponibilidad, o cualquier mensaje humano con pregunta\n2. "solicitud_servicio" — quiere contratar/encargar un servicio legal concreto\n3. "otro" — spam o mensaje automatico sin contenido humano util\n\nIMPORTANTE: Si tienes duda, responde "consulta_general".\n\nResponde SOLO con JSON: {"type":"consulta_general"|"solicitud_servicio"|"otro"}${historyContext ? `\n\n${historyContext}` : ''}\n/no_think`;

    const response = await getAI().chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: body.substring(0, 2000) },
      ],
      max_tokens: 120,
      temperature: 0.1,
    });

    const content = (response.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const type = parsed?.type;
      if (type === 'consulta_general' || type === 'solicitud_servicio' || type === 'otro') {
        return { type };
      }
    }
  } catch (err) {
    console.error('[WA] classifyWhatsAppMessage error:', err);
  }

  return { type: 'consulta_general' };
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
      model: AI_MODEL,
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

    const answer = (response.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
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

  const folders: Array<{ id: string; name: string; conversationIds: string[] }> = account.whatsappFolders || [];
  if (folders.length === 0) return;

  let modified = false;

  for (const rule of rules) {
    const targetFolderIds = (rule.folderIds || []).filter((fid) => folders.some((f) => f.id === fid));
    if (targetFolderIds.length === 0) continue;

    const folderNames = targetFolderIds.map((fid) => folders.find((f) => f.id === fid)?.name || fid).join(', ');
    const prompt = `Regla de clasificacion WhatsApp:\nNombre: "${rule.name}"\nDescripcion: "${rule.description}"\nCarpetas destino: "${folderNames}"\n\nMensaje entrante:\n${messageText.substring(0, 2000)}\n\nResponde SOLO con JSON: {"match": true} o {"match": false}\n/no_think`;

    try {
      const response = await getAI().chat.completions.create({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 80,
        temperature: 0.1,
      });

      const content = (response.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const json = content.match(/\{[\s\S]*\}/);
      if (!json) continue;

      const parsed = JSON.parse(json[0]);
      if (parsed.match !== true) continue;

      for (const folderId of targetFolderIds) {
        const folder = account.whatsappFolders.find((f: any) => f.id === folderId);
        if (folder && !folder.conversationIds.includes(conversationId)) {
          folder.conversationIds.push(conversationId);
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
): Promise<boolean> {
  const consultaEmails: string[] = account.whatsappCorreosConsultas || [];
  if (consultaEmails.length === 0) return false;

  const cuentaCorreo = (account.cuentasCorreo || [])[0];
  if (!cuentaCorreo) {
    console.warn('[WA] No hay cuenta de correo para reenviar consulta WhatsApp');
    return false;
  }

  const cuentaConfig: CuentaCorreoConfig = {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: decryptPassword(cuentaCorreo.password),
  };

  const consultaId = Date.now().toString();
  const subject = `[Consulta pendiente] [CP-${consultaId}] WhatsApp: ${contactName} (+${contactPhone})`;

  let body = `Se ha recibido una consulta por WhatsApp que requiere respuesta manual.\n\n`;
  body += `CONTACTO: ${contactName} (+${contactPhone})\n`;
  body += `MENSAJE:\n${messageText}\n\n`;

  if (mediaAttachment?.filename) {
    const mediaUrl = `${BACKEND_URL}/api/whatsapp/wa-attachments/${encodeURIComponent(mediaAttachment.filename)}`;
    body += `ADJUNTO ENLACE: ${mediaUrl}\n\n`;
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
      await sendEmailViaCuenta(cuentaConfig, consultaEmail, subject, body, attachments.length > 0 ? attachments : undefined);
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
    cuentaCorreoId: cuentaCorreo.id,
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

  const token = getSessionToken(account);
  if (!token) return null;

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

    let conv = account.whatsappConversations.find((c: any) => c.contactPhone === contactPhone);
    const isKnownContact = !!conv;

    if (!conv) {
      conv = {
        id: `waconv_${Date.now()}`,
        contactName,
        contactPhone,
        messages: [],
        lastMessageTime: new Date().toISOString(),
        unread: 0,
        autoReplyPaused: false,
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

    const historyMessages = (conversation.messages || []).slice(0, -1).map((m: any) => `${m.sent ? 'Asistente' : contactName}: ${m.text}`).join('\n');
    const historyContext = historyMessages ? `CONTEXTO PREVIO:\n${historyMessages.substring(0, 6000)}` : '';

    const classification = await classifyWhatsAppMessage(text, historyContext);
    const respondConsultas = account.whatsappRespondConsultasGenerales !== false;
    const respondSolicitudes = account.whatsappRespondSolicitudesServicio !== false;
    const soloConocidos = account.whatsappSoloContactosConocidos === true;

    await applyWhatsAppClassifyRules(account, conversation.id, text);

    if (soloConocidos && !isKnownContact && classification.type !== 'otro') return;
    if (classification.type === 'consulta_general' && !respondConsultas) return;
    if (classification.type === 'solicitud_servicio' && !respondSolicitudes) return;
    if (classification.type === 'otro') return;

    const instanceName = account.whatsappSession?.instanceName || `lyrium_${accountId}`;

    if (classification.type === 'consulta_general') {
      const kbContext = getKBContext(account);
      const kbResult = await findAnswerInKB(text, kbContext, historyContext);

      if (kbResult.found && kbResult.answer) {
        try {
          await sendTextMessage(instanceName, contactPhone, kbResult.answer);
          conversation.messages.push({
            id: `wa_reply_${Date.now()}`,
            from: 'lyra',
            text: kbResult.answer,
            time: new Date().toISOString(),
            sent: true,
          });
          conversation.lastMessageTime = new Date().toISOString();
          await account.save();
        } catch (err) {
          console.error('[WA] Error enviando respuesta automática KB:', err);
        }
      } else {
        await forwardWhatsAppToConsultas(account, conversation.id, contactPhone, contactName, text, 'consulta_general');
      }
      return;
    }

    if (classification.type === 'solicitud_servicio') {
      const neutral = 'Hemos recibido su solicitud. La estamos revisando y le responderemos en breve.';
      try {
        await sendTextMessage(instanceName, contactPhone, neutral);
        conversation.messages.push({
          id: `wa_reply_${Date.now()}`,
          from: 'lyra',
          text: neutral,
          time: new Date().toISOString(),
          sent: true,
        });
        conversation.lastMessageTime = new Date().toISOString();
        await account.save();
      } catch (err) {
        console.error('[WA] Error enviando acuse de solicitud:', err);
      }

      await forwardWhatsAppToConsultas(account, conversation.id, contactPhone, contactName, text, 'solicitud_sin_especialista');
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
        'whatsappSession.provider': 'meta',
        'whatsappSession.instanceName': instanceName,
        'whatsappSession.connected': false,
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
  code: string,
  state: string,
  redirectUri?: string,
): Promise<{ connected: boolean; phoneNumber?: string; phoneNumberId?: string }> {
  if (!account) throw new Error('Cuenta no encontrada');

  const expectedState = account.whatsappOAuthState || '';
  const expectedExp = account.whatsappOAuthStateExpires || '';
  if (!expectedState || expectedState !== state) throw new Error('State OAuth inválido');
  if (!expectedExp || new Date(expectedExp).getTime() < Date.now()) throw new Error('State OAuth expirado');

  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();

  const tokenUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  // Embedded Signup (FB.login) always uses this URI internally — must match exactly
  const finalRedirectUri = redirectUri || 'https://www.facebook.com/connect/login_success.html';
  tokenUrl.searchParams.set('redirect_uri', finalRedirectUri);
  tokenUrl.searchParams.set('code', code);

  const tokenRes = await fetch(tokenUrl.toString());
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => '');
    throw new Error(`No se pudo canjear código OAuth (${tokenRes.status}): ${txt}`);
  }
  const tokenData = await tokenRes.json();
  let accessToken = tokenData?.access_token as string;
  if (!accessToken) throw new Error('Meta no devolvió access_token');

  // Try to exchange for long-lived token
  try {
    const llUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
    llUrl.searchParams.set('grant_type', 'fb_exchange_token');
    llUrl.searchParams.set('client_id', appId);
    llUrl.searchParams.set('client_secret', appSecret);
    llUrl.searchParams.set('fb_exchange_token', accessToken);
    const llRes = await fetch(llUrl.toString());
    if (llRes.ok) {
      const llData = await llRes.json();
      if (llData?.access_token) accessToken = llData.access_token;
    }
  } catch {
    // Keep short-lived token if long-lived exchange fails.
  }

  const wabaResp = await graphFetchJson<any>('/me/whatsapp_business_accounts', accessToken);
  const waba = Array.isArray(wabaResp?.data) ? wabaResp.data[0] : null;
  if (!waba?.id) throw new Error('No se encontró ninguna cuenta de WhatsApp Business en Meta');

  const phoneResp = await graphFetchJson<any>(`/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name`, accessToken);
  const phone = Array.isArray(phoneResp?.data) ? phoneResp.data[0] : null;
  if (!phone?.id) throw new Error('No se encontró ningún número en la cuenta de WhatsApp Business');

  account.whatsappSession = {
    ...(account.whatsappSession || {}),
    provider: 'meta',
    instanceName: account.whatsappSession?.instanceName || `lyrium_${String(account._id)}`,
    connected: true,
    connectedAt: new Date().toISOString(),
    phoneNumber: phone.display_phone_number || '',
    businessAccountId: waba.id,
    phoneNumberId: phone.id,
    accessToken: encryptPassword(accessToken),
  } as any;
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
  return connectMetaWithCodeInternal(account, code, state, redirectUri);
}

export async function connectMetaWithCodeByState(
  code: string,
  state: string,
  redirectUri?: string,
): Promise<{ connected: boolean; phoneNumber?: string; phoneNumberId?: string; accountId: string }> {
  if (!state) throw new Error('State OAuth inválido');

  const account = await Automation.findOne({ whatsappOAuthState: state });
  if (!account) throw new Error('State OAuth inválido');

  const result = await connectMetaWithCodeInternal(account, code, state, redirectUri);

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
        'whatsappSession.provider': 'meta',
        'whatsappSession.instanceName': instanceName,
        'whatsappSession.connected': false,
      },
    },
    { upsert: true },
  );

  return { instanceName, state, appId };
}

export async function getInstanceStatus(instanceName: string): Promise<{ connected: boolean; phoneNumber?: string }> {
  const accountId = accountIdFromInstanceName(instanceName);
  const account = await Automation.findById(accountId);
  if (!account?.whatsappSession?.phoneNumberId) {
    return { connected: false };
  }

  const token = getSessionToken(account);
  if (!token) return { connected: false };

  try {
    const data = await graphFetchJson<any>(`/${account.whatsappSession.phoneNumberId}?fields=display_phone_number`, token);
    const phoneNumber = data?.display_phone_number || account.whatsappSession.phoneNumber || '';

    if (!account.whatsappSession.connected || account.whatsappSession.phoneNumber !== phoneNumber) {
      account.whatsappSession.connected = true;
      account.whatsappSession.phoneNumber = phoneNumber;
      await account.save();
    }

    return { connected: true, phoneNumber };
  } catch (err) {
    console.error('[WA] getInstanceStatus error:', err);
    if (account.whatsappSession.connected) {
      account.whatsappSession.connected = false;
      await account.save();
    }
    return { connected: false, phoneNumber: account.whatsappSession.phoneNumber || undefined };
  }
}

export async function getQRCode(_instanceName: string): Promise<string | null> {
  return null;
}

export async function disconnectInstance(instanceName: string): Promise<void> {
  const accountId = accountIdFromInstanceName(instanceName);
  const account = await Automation.findById(accountId);
  if (!account) return;

  account.whatsappSession = {
    provider: 'meta',
    instanceName,
    connected: false,
    phoneNumber: '',
    connectedAt: '',
    businessAccountId: '',
    phoneNumberId: '',
    accessToken: '',
  } as any;
  await account.save();
}

export async function deleteInstance(instanceName: string): Promise<void> {
  await disconnectInstance(instanceName);
}

// ── Send messages ─────────────────────────────────────────────────────
export async function sendTextMessage(instanceName: string, phone: string, text: string): Promise<any> {
  const accountId = accountIdFromInstanceName(instanceName);
  const account = await Automation.findById(accountId);
  if (!account?.whatsappSession?.phoneNumberId) throw new Error('WhatsApp Meta no conectado');

  const token = getSessionToken(account);
  if (!token) throw new Error('Token Meta inválido');

  const to = sanitizePhone(phone);
  if (!to) throw new Error('Número de destino inválido');

  return graphFetchJson<any>(`/${account.whatsappSession.phoneNumberId}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text.substring(0, 4096) },
    }),
  });
}

export async function sendMediaMessage(instanceName: string, phone: string, filePath: string, caption?: string): Promise<any> {
  const accountId = accountIdFromInstanceName(instanceName);
  const account = await Automation.findById(accountId);
  if (!account?.whatsappSession?.phoneNumberId) throw new Error('WhatsApp Meta no conectado');

  const token = getSessionToken(account);
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
  const mediaUrl = `${BACKEND_URL}/api/whatsapp/wa-attachments/${encodeURIComponent(filename)}`;

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type,
  };

  if (type === 'image') payload.image = { link: mediaUrl, caption: caption || '' };
  else if (type === 'video') payload.video = { link: mediaUrl, caption: caption || '' };
  else if (type === 'audio') payload.audio = { link: mediaUrl };
  else payload.document = { link: mediaUrl, caption: caption || '', filename };

  return graphFetchJson<any>(`/${account.whatsappSession.phoneNumberId}/messages`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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
      await processOneIncomingMetaMessage(account._id, phoneNumberId, value, msg);
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
