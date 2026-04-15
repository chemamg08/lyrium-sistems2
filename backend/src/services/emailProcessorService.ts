import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { AI_MODEL } from '../config/aiModel.js';
import {
  fetchUnreadEmails,
  sendEmailViaCuenta,
  replyToEmail,
  type CuentaCorreoConfig,
  type IncomingEmail,
  type IncomingEmailAttachment,
} from './emailService.js';
import { Automation } from '../models/Automation.js';
import { Client } from '../models/Client.js';
import { Subaccount } from '../models/Subaccount.js';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads/automatizaciones');
const EMAIL_ATTACHMENTS_DIR = path.join(__dirname, '../../uploads/email-attachments');
const META_API_VERSION = process.env.WHATSAPP_META_API_VERSION || 'v22.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Ensure directories exist
if (!fs.existsSync(EMAIL_ATTACHMENTS_DIR)) fs.mkdirSync(EMAIL_ATTACHMENTS_DIR, { recursive: true });

// ── Encryption for email passwords (AES-256-GCM) ────────────────────
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
    console.error('[decryptPassword] Failed to decrypt — JWT_SECRET may differ from when password was encrypted');
    return '';
  }
}

// ── AI clients ───────────────────────────────────────────────────────
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

// ── Interfaces ───────────────────────────────────────────────────────
interface Especialidad { id: string; nombre: string; descripcion: string; createdAt: string; }
interface CuentaCorreo { id: string; plataforma: string; correo: string; password: string; createdAt: string; }
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
  }>;
  lastMessageTime: string;
  unread: number;
  autoClientId?: string;
  autoReplyPaused?: boolean;
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

// ── Data helpers (Mongoose) ──────────────────────────────────────────
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
  // NOTE: pendingReplies is intentionally excluded — managed via atomic $push/$pull/$inc
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

// ── Per-account processing lock to avoid race conditions ─────────────
const accountLocks = new Map<string, Promise<void>>();
function withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  const prev = accountLocks.get(accountId) || Promise.resolve();
  const next = prev.then(fn, fn);
  accountLocks.set(accountId, next.then(() => {}, () => {}));
  return next;
}

// ── Get KB context from uploaded docs ────────────────────────────────
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

// ── Extract text from PDF (for new knowledge docs) ───────────────────
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

// ── Build email conversation history context for AI prompts ──────────
const EMAIL_HISTORY_CHAR_LIMIT = 100_000;
const EMAIL_KEEP_RECENT = 15;

async function buildEmailHistoryText(
  messages: Array<{ text: string; sent: boolean }>,
  contactLabel: string,
): Promise<string> {
  if (!messages || messages.length === 0) return '';
  const transcript = messages.map(m => `${m.sent ? 'Asistente' : contactLabel}: ${(m.text || '').substring(0, 2000)}`).join('\n\n');
  if (transcript.length <= EMAIL_HISTORY_CHAR_LIMIT) {
    return `\nCONTEXTO — CONVERSACIÓN PREVIA CON ESTE CLIENTE:\n${transcript}`;
  }
  // Too long: summarize older messages, keep most recent complete
  const recent = messages.slice(-EMAIL_KEEP_RECENT);
  const older = messages.slice(0, -EMAIL_KEEP_RECENT);
  const olderTranscript = older.map(m => `${m.sent ? 'Asistente' : contactLabel}: ${(m.text || '').substring(0, 1000)}`).join('\n\n');
  let summary = '';
  try {
    const res = await getQwen().chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'Resume brevemente esta conversación de email de un despacho legal. Máximo 5 frases. Sin introducciones. /no_think' },
        { role: 'user', content: olderTranscript.substring(0, 40_000) },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });
    summary = res.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || '';
  } catch (err) {
    console.error('[Email] Error summarizing history:', err);
  }
  const recentTranscript = recent.map(m => `${m.sent ? 'Asistente' : contactLabel}: ${(m.text || '').substring(0, 2000)}`).join('\n\n');
  if (summary) {
    return `\nRESUMEN DE LA CONVERSACIÓN PREVIA:\n${summary}\n\nMENSAJES RECIENTES:\n${recentTranscript}`;
  }
  return `\nCONTEXTO — MENSAJES RECIENTES:\n${recentTranscript}`;
}

// ── 1. Classify email with Mistral ───────────────────────────────────
async function classifyEmail(
  emailBody: string,
  emailSubject: string,
  especialidades: Especialidad[],
  historyContext?: string,
): Promise<{ type: 'consulta_general' | 'solicitud_servicio' | 'otro'; especialidadId?: string }> {
  const espList = especialidades.map(e => `- ID: ${e.id} | Nombre: "${e.nombre}" | Descripción: "${e.descripcion}"`).join('\n');

  const prompt = `Analiza el siguiente email y clasifícalo en una de estas categorías:
1. "consulta_general" — El remitente hace una pregunta general, pide información (horarios, precios, servicios, disponibilidad, etc.), o cualquier mensaje de una persona real que contenga una pregunta o solicitud de información
2. "solicitud_servicio" — El remitente solicita un servicio legal concreto, necesita un abogado, tiene un caso legal, quiere contratar servicios
3. "otro" — SOLO para spam, publicidad, newsletters, notificaciones automáticas de sistemas, o emails claramente generados por máquinas que no contienen ninguna pregunta ni solicitud de una persona real

IMPORTANTE: Si hay CUALQUIER duda sobre la categoría, clasifica como "consulta_general". Solo usa "otro" si estás COMPLETAMENTE SEGURO de que es spam o un email automático sin contenido humano.

${especialidades.length > 0 ? `Si es "solicitud_servicio", indica qué especialidad encaja mejor de las siguientes. IMPORTANTE: Si NINGUNA especialidad encaja con lo que pide el cliente, devuelve "especialidadId": null\n${espList}` : ''}

Responde SOLO con JSON: {"type": "consulta_general"|"solicitud_servicio"|"otro"${especialidades.length > 0 ? ', "especialidadId": "id_de_la_especialidad o null si ninguna encaja"' : ''}}${historyContext ? '\n' + historyContext + '\n' : ''}
ASUNTO: ${emailSubject}
CONTENIDO:
${emailBody.substring(0, 3000)}`;

  try {
    const response = await getQwen().chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt + '\n/no_think' }],
      max_tokens: 200,
      temperature: 0.1,
    });

    const text = (response.choices[0].message.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Normalize null-like especialidadId
      if (parsed.especialidadId === null || parsed.especialidadId === 'null' || parsed.especialidadId === '') {
        parsed.especialidadId = undefined;
      } else if (parsed.especialidadId !== undefined) {
        // Ensure it's always a string
        parsed.especialidadId = String(parsed.especialidadId);
      }
      return parsed;
    }
  } catch (err) {
    console.error('Error clasificando email con Qwen:', err);
  }

  return { type: 'otro' };
}

// ── 2. Search KB and generate answer with Qwen ──────────────────────
async function findAnswerInKB(
  emailBody: string,
  emailSubject: string,
  kbContext: string,
  historyContext?: string,
): Promise<{ found: boolean; answer?: string }> {
  if (!kbContext.trim()) return { found: false };

  try {
    const response = await getQwen().chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Eres el asistente de un despacho de abogados. Responde preguntas basándote ÚNICAMENTE en la información de los documentos proporcionados. Si no tienes información suficiente para responder, di exactamente "NO_TENGO_INFO". Sé profesional y conciso.

DOCUMENTOS DEL DESPACHO:
${kbContext.substring(0, 8000)}`,
        },
        {
          role: 'user',
          content: `${historyContext ? historyContext + '\n\n' : ''}Responde a este email:\nAsunto: ${emailSubject}\n\n${emailBody.substring(0, 2000)}`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const answer = response.choices[0].message.content || '';
    if (answer.includes('NO_TENGO_INFO')) return { found: false };
    return { found: true, answer };
  } catch (err) {
    console.error('Error buscando en KB:', err);
    return { found: false };
  }
}

// ── 2b. Compose professional reply from raw consultas instruction ────
async function composeClientReply(
  originalSubject: string,
  originalBody: string,
  rawInstruction: string,
  historyContext?: string,
): Promise<string> {
  try {
    const response = await getQwen().chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Eres el asistente de email de un despacho profesional. Tu tarea es redactar una respuesta breve y profesional para enviar a un cliente.

Se te proporcionará:
1. La pregunta original del cliente (CONTEXTO — úsala para entender a qué se refiere la instrucción)
2. La instrucción/información que te da el responsable del despacho (CONTENIDO — la información que debes transmitir)

Reglas ESTRICTAS:
- Lee primero la pregunta del cliente para entender el contexto exacto. Luego aplica la instrucción del responsable sobre ese contexto
- Por ejemplo: si el cliente preguntó "¿Cuánto cuesta el servicio de divorcio?" y el responsable dice "dile que 500€", tu respuesta debe mencionar "el servicio de divorcio" (tomado de la pregunta) y "500 €" (tomado de la instrucción)
- Usa ÚNICAMENTE la información que te da el responsable. NO añadas, inventes ni amplíes datos que no estén en la instrucción
- NO incluyas firmas, nombres, teléfonos, correos ni datos de contacto. NUNCA pongas placeholders como "[Nombre]", "[Teléfono]", "[Despacho]" ni similares
- Estructura: saludo breve → respuesta clara referenciando lo que el cliente preguntó → despedida corta ("Un saludo" o "Quedamos a su disposición")
- Responde en el mismo idioma que el cliente
- No menciones que alguien te dio instrucciones`,
        },
        {
          role: 'user',
          content: `${historyContext ? historyContext + '\n\n' : ''}PREGUNTA DEL CLIENTE:\nAsunto: ${originalSubject}\n${originalBody.substring(0, 2000)}\n\nINSTRUCCIÓN DEL RESPONSABLE:\n${rawInstruction.substring(0, 2000)}\n/no_think`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const text = (response.choices[0].message.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return text || rawInstruction;
  } catch (err) {
    console.error('[composeClientReply] Error:', err);
    return rawInstruction;
  }
}

// ── 3. Forward to consultas correo ───────────────────────────────────
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
        model: AI_MODEL,
        messages: [
          { role: 'system', content: 'Eres un asistente que resume conversaciones de email de un despacho de abogados. Genera un resumen breve y claro en español de la conversación, destacando: el tema principal, lo que pide el cliente, y las respuestas que se le han dado. Máximo 5 frases. No uses saludos ni introducciones, ve directo al resumen.' },
          { role: 'user', content: transcript },
        ],
        max_tokens: 300,
      });
      const summary = res.choices?.[0]?.message?.content?.trim();
      if (summary) {
        contextSummary = `\n\nRESUMEN DE LA CONVERSACIÓN PREVIA:\n${summary}`;
      }
    } catch (err) {
      console.error('[EmailProcessor] Error generating conversation summary:', err);
      // Fallback: list last 3 messages
      const last3 = conv.messages.slice(-3).map((m: any) => {
        const who = m.sent ? 'Asistente' : (conv.contactName || conv.contactEmail);
        return `${who}: ${(m.text || '').substring(0, 300)}`;
      });
      contextSummary = `\n\nÚLTIMOS MENSAJES DE LA CONVERSACIÓN:\n${last3.join('\n')}`;
    }
  }

  let forwardBody: string;
  if (type === 'solicitud_sin_especialista') {
    forwardBody = `Se ha recibido una solicitud de servicio de "${especialidadNombre || 'especialidad desconocida'}" pero no hay ningún abogado asignado a esa especialidad.

DE: ${email.fromName} <${email.from}>
ASUNTO: ${email.subject}
MENSAJE:
${cleanBody}${contextSummary}

---
Responde a este email indicando qué hacer. Ejemplos:
- "Dile que no ofrecemos ese servicio"
- "Asígnale el caso a [nombre del abogado]"
- "Pausa la respuesta automática para este cliente" (para atenderlo manualmente)
- O escribe directamente el mensaje que quieras enviar al cliente.`;
  } else {
    forwardBody = `Se ha recibido una consulta por email que no hemos podido responder automáticamente. Por favor, indica cómo responder:

DE: ${email.fromName} <${email.from}>
ASUNTO: ${email.subject}
MENSAJE:
${cleanBody}${contextSummary}

---
Responde a este email con las instrucciones para la respuesta.
También puedes escribir "pausa la respuesta automática" para desactivar las respuestas automáticas de este cliente.`;
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

// ── Helper: strip quoted text from email replies ─────────────────────
function stripQuotedText(body: string): string {
  const lines = body.split('\n');
  const cleanLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Gmail Spanish: "El lun, 28 feb 2026, 21:42, <email> escribió:"
    if (/^El\s+.+escribi[oó]:\s*$/i.test(trimmed)) break;

    // Gmail English: "On Mon, Feb 28, 2026 at 9:42 PM <email> wrote:"
    if (/^On\s+.+wrote:\s*$/i.test(trimmed)) break;

    // Gmail German: "Am Mo., 28. Feb. 2026 um 21:42 Uhr schrieb <email>:"
    if (/^Am\s+.+schrieb\s+/i.test(trimmed)) break;

    // Gmail French: "Le lun. 28 févr. 2026 à 21:42, <email> a écrit :"
    if (/^Le\s+.+a\s+[eé]crit\s*:/i.test(trimmed)) break;

    // Gmail Portuguese: "Em seg., 28 de fev. de 2026 às 21:42, <email> escreveu:"
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

async function sendWhatsAppReplyFromPending(account: any, toPhone: string, text: string): Promise<void> {
  const session = account?.whatsappSession;
  const phoneNumberId = session?.phoneNumberId || '';
  const encryptedToken = session?.accessToken || '';
  const accessToken = decryptPassword(encryptedToken);
  const to = sanitizePhoneForWA(toPhone);

  if (!phoneNumberId || !accessToken || !to) {
    throw new Error('WhatsApp Meta no está conectado correctamente para enviar la respuesta');
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

// ── 3b. Interpret consulta action (AI) ───────────────────────────────
async function interpretConsultaAction(
  replyText: string,
  originalSubject: string,
  originalBody: string,
  subaccountNames: string[],
): Promise<{ action: 'reject' | 'assign' | 'reply' | 'pause'; message?: string; assignToName?: string }> {
  const subNamesStr = subaccountNames.length > 0 ? subaccountNames.join(', ') : 'Ninguno disponible';

  try {
    const response = await getQwen().chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Eres un asistente que interpreta instrucciones de un responsable de despacho sobre cómo actuar con la solicitud de un cliente.

El responsable ha recibido un aviso de que un cliente pide un servicio para el que no hay abogado asignado. El responsable responde con instrucciones.

Analiza la respuesta y clasifícala:
- "reject": Indica que NO se ofrece ese servicio. Genera un mensaje educado de rechazo para el cliente.
- "assign": Indica asignar el caso a un abogado concreto. Extrae el nombre.
- "reply": Da instrucciones libres o un mensaje directo para el cliente. Genera el mensaje.
- "pause": Indica que se pause/desactive la respuesta automtica para este cliente (el responsable quiere atenderlo manualmente).

Abogados disponibles: ${subNamesStr}

Responde SOLO con JSON válido:
{"action": "reject"|"assign"|"reply"|"pause", "message": "texto para el cliente (para reject, reply y pause)", "assignToName": "nombre (solo para assign)"}
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

    // Remove <think>...</think> blocks if present
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }
    console.warn('[interpretConsultaAction] No valid JSON found in AI response');
  } catch (err) {
    console.error('Error interpretando respuesta de consulta:', err);
  }

  // Fallback: reply with safe generic message (never auto-reject on AI failure)
  return { action: 'reply', message: 'Hemos recibido su mensaje. Nuestro equipo lo revisará y le responderá a la mayor brevedad posible.' };
}

// ── 3c. Interpret client confirmation (affirmative/negative) ──────────
async function interpretClientConfirmation(replyText: string): Promise<boolean> {
  try {
    const response = await getQwen().chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Determines if a client's reply is affirmative (yes, they want the service) or negative (no, they decline).
Reply ONLY with JSON: {"affirmative": true} or {"affirmative": false}
/no_think`,
        },
        { role: 'user', content: replyText },
      ],
      temperature: 0.1,
      max_tokens: 50,
    });

    const content = response.choices[0]?.message?.content || '';
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.affirmative === true;
    }
  } catch (err) {
    console.error('[interpretClientConfirmation] Error:', err);
  }
  // Default: assume affirmative to not lose potential clients
  return true;
}

// ── 3d. Detect if client explicitly requests assignment ───────────────
async function detectExplicitAssignmentRequest(emailBody: string, emailSubject: string): Promise<boolean> {
  try {
    const response = await getQwen().chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Analiza si el cliente pide EXPLÍCITAMENTE que se le asigne un abogado o profesional. 
Devuelve true SOLO si el cliente dice claramente algo como "asignadme un abogado", "quiero que me asignéis un abogado", "necesito que me pongan un abogado ya", etc.
Si simplemente describe su caso o pregunta si tienen abogados, devuelve false.
Responde SOLO con JSON: {"explicit": true} o {"explicit": false}
/no_think`,
        },
        { role: 'user', content: `Asunto: ${emailSubject}\n\n${emailBody.substring(0, 2000)}` },
      ],
      temperature: 0.1,
      max_tokens: 50,
    });

    const content = (response.choices[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.explicit === true;
    }
  } catch (err) {
    console.error('[detectExplicitAssignmentRequest] Error:', err);
  }
  return false;
}

// ── 4. Process consulta reply ────────────────────────────────────────
async function processConsultaReply(
  reply: IncomingEmail,
  accountId: string,
): Promise<boolean> {
  const account = await getAccount(accountId);

  const pendingIdx = account.pendingConsultas.findIndex(
    (p: any) => {
      // Match by unique consulta ID in subject (e.g. [CP-1234567890])
      const idMatch = reply.subject.match(/\[CP-(\d+)\]/);
      if (idMatch && p.id === idMatch[1]) return true;
      // Fallback: match by original subject content
      if (reply.subject.includes(p.originalSubject)) return true;
      return false;
    }
  );

  if (pendingIdx === -1) return false;

  const pending = account.pendingConsultas[pendingIdx];
  const cleanReply = stripQuotedText(reply.body);

  const cuentaCorreo = account.cuentasCorreo.find((c: any) => c.id === pending.cuentaCorreoId);
  if (!cuentaCorreo) {
    account.pendingConsultas.splice(pendingIdx, 1);
    await saveAccount(account);
    return true;
  }

  const cuentaConfig: CuentaCorreoConfig = {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: decryptPassword(cuentaCorreo.password),
  };

  // ── WhatsApp pending consulta flow (email -> WhatsApp) ──
  if (pending.channel === 'whatsapp') {
    const pauseKeywords = /\b(pausa|pausar|desactiva|desactivar|detener|para)\b.*(automatic|automátic|respuesta)/i;
    if (pauseKeywords.test(cleanReply)) {
      const waConv = (account.whatsappConversations || []).find((c: any) =>
        (pending.waConversationId && c.id === pending.waConversationId)
        || (pending.waContactPhone && sanitizePhoneForWA(c.contactPhone) === sanitizePhoneForWA(pending.waContactPhone))
      );
      if (waConv) {
        waConv.autoReplyPaused = true;
        waConv.lastMessageTime = new Date().toISOString();
      }

      account.pendingConsultas.splice(pendingIdx, 1);
      await saveAccount(account);
      return true;
    }

    // Save manager instruction as new KB snippet (shared docs between Email and WhatsApp)
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

    const waConv = (account.whatsappConversations || []).find((c: any) =>
      (pending.waConversationId && c.id === pending.waConversationId)
      || (pending.waContactPhone && sanitizePhoneForWA(c.contactPhone) === sanitizePhoneForWA(pending.waContactPhone))
    );
    const waHistCtx = (waConv?.messages?.length ?? 0) > 0
      ? `CONTEXTO — CONVERSACION PREVIA DE WHATSAPP:\n${waConv!.messages.slice(-20).map((m: any) => `${m.sent ? 'Asistente' : (waConv?.contactName || pending.originalFromName)}: ${m.text}`).join('\n')}`
      : '';

    const composedReply = await composeClientReply(
      pending.originalSubject,
      pending.originalBody,
      cleanReply,
      waHistCtx,
    );

    const waTargetPhone = pending.waContactPhone || pending.originalFrom;
    try {
      await sendWhatsAppReplyFromPending(account, waTargetPhone, composedReply);
      appendOutgoingWhatsAppMessage(
        account,
        pending.waConversationId || pending.conversationId,
        waTargetPhone,
        composedReply,
      );
    } catch (err) {
      console.error('[processConsultaReply] Error enviando respuesta a WhatsApp:', err);
    }

    account.pendingConsultas.splice(pendingIdx, 1);
    await saveAccount(account);
    return true;
  }

  if (pending.type === 'confirmacion_asignacion') {
    // ── Client replied to assignment confirmation ──
    const conv = account.emailConversations.find((c: any) => c.id === pending.conversationId);
    const timeStr = new Date().toISOString();

    // Add client's reply to conversation
    if (conv) {
      conv.messages.push({ id: Date.now().toString(), from: conv.contactName || pending.originalFromName, text: cleanReply, time: timeStr, sent: false });
      conv.unread++;
      conv.lastMessageTime = new Date().toISOString();
    }

    // Use AI to determine if the reply is affirmative or negative
    const isAffirmative = await interpretClientConfirmation(cleanReply);

    if (isAffirmative) {
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
      await assignCase(origEmail, accountId, account, pending.especialidadId, cuentaCorreo, pending.conversationId);

      const confirmMsg = 'Perfecto, le hemos asignado un abogado especializado. Se pondrá en contacto con usted en breve.';
      await replyToEmail(cuentaConfig, pending.originalFrom, pending.originalSubject, confirmMsg);
      if (conv) {
        conv.messages.push({ id: Date.now().toString(), from: 'Asistente', text: confirmMsg, time: timeStr, sent: true });
        conv.lastMessageTime = new Date().toISOString();
      }
    } else {
      const declineMsg = 'Entendido. Si en el futuro necesita nuestros servicios, no dude en contactarnos.';
      await replyToEmail(cuentaConfig, pending.originalFrom, pending.originalSubject, declineMsg);
      if (conv) {
        conv.messages.push({ id: Date.now().toString(), from: 'Asistente', text: declineMsg, time: timeStr, sent: true });
        conv.lastMessageTime = new Date().toISOString();
      }
    }

    account.pendingConsultas.splice(pendingIdx, 1);
    await saveAccount(account);
    return true;
  }

  if (pending.type === 'solicitud_sin_especialista') {
    // ── Use AI to interpret the consultas reply ──
    const subaccounts = await Subaccount.find({ parentAccountId: accountId });
    const subNames = subaccounts.map((s: any) => s.name || s.email);

    const interpretation = await interpretConsultaAction(
      cleanReply, pending.originalSubject, pending.originalBody, subNames,
    );

    const conv = account.emailConversations.find((c: any) => c.id === pending.conversationId);
    const timeStr = new Date().toISOString();

    if (interpretation.action === 'assign' && interpretation.assignToName) {
      const targetName = interpretation.assignToName.toLowerCase();
      const targetSub = subaccounts.find((s: any) =>
        (s.name || '').toLowerCase().includes(targetName)
        || (s.email || '').toLowerCase().includes(targetName)
      );

      if (targetSub) {
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
        await assignCaseToSubaccount(origEmail, accountId, account, targetSub, cuentaCorreo, pending.conversationId, pending.especialidadId);

        const ackMsg = 'Hemos asignado su caso a un profesional especializado. Le contactará en breve.';
        await replyToEmail(cuentaConfig, pending.originalFrom, pending.originalSubject, ackMsg);
        if (conv) {
          conv.messages.push({ id: Date.now().toString(), from: 'Asistente', text: ackMsg, time: timeStr, sent: true });
          conv.lastMessageTime = new Date().toISOString();
        }
      } else {
        // Could not find subcuenta, send a safe message
        const msg = interpretation.message || 'No hemos podido asignar su caso en este momento. Nos pondremos en contacto con usted lo antes posible.';
        await replyToEmail(cuentaConfig, pending.originalFrom, pending.originalSubject, msg);
        if (conv) {
          conv.messages.push({ id: Date.now().toString(), from: 'Asistente', text: msg, time: timeStr, sent: true });
          conv.lastMessageTime = new Date().toISOString();
        }
      }
    } else if (interpretation.action === 'pause') {
      // pause auto-reply for this conversation
      if (conv) {
        conv.autoReplyPaused = true;
        conv.lastMessageTime = new Date().toISOString();
      }
    } else {
      // reject or reply — send the AI-generated message to the client
      const defaultMsg = interpretation.action === 'reject'
        ? 'Lamentamos informarle de que actualmente no ofrecemos el servicio solicitado. Le pedimos disculpas por las molestias.'
        : 'Hemos revisado su consulta y le responderemos en breve con más información.';
      const msg = interpretation.message || defaultMsg;
      await replyToEmail(cuentaConfig, pending.originalFrom, pending.originalSubject, msg);
      if (conv) {
        conv.messages.push({ id: Date.now().toString(), from: 'Asistente', text: msg, time: timeStr, sent: true });
        conv.lastMessageTime = new Date().toISOString();
      }
    }
  } else {
    // ── consulta_general ──
    // Check if the reply is asking to pause auto-reply
    const pauseKeywords = /\b(pausa|pausar|desactiva|desactivar|detener|para)\b.*(automátic|respuesta)/i;
    if (pauseKeywords.test(cleanReply)) {
      const convPause = account.emailConversations.find((c: any) => c.id === pending.conversationId);
      if (convPause) {
        convPause.autoReplyPaused = true;
        convPause.lastMessageTime = new Date().toISOString();
      }

      account.pendingConsultas.splice(pendingIdx, 1);
      await saveAccount(account);
      return true;
    }

    // Normal flow: save KB doc + reply
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

    // Compose professional reply from raw instruction
    const conv = account.emailConversations.find((c: any) => c.id === pending.conversationId);
    const histCtx = (conv?.messages?.length ?? 0) > 0
      ? await buildEmailHistoryText(conv!.messages, conv!.contactName || pending.originalFromName)
      : '';
    const composedReply = await composeClientReply(pending.originalSubject, pending.originalBody, cleanReply, histCtx);
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

// ── 4b. Check if a matching specialist exists ───────────────────────
async function hasMatchingSpecialist(accountId: string, account: any, especialidadId?: string): Promise<boolean> {
  const subaccounts = await Subaccount.find({ parentAccountId: accountId });
  const subs = account.subcuentaEspecialidades || {};
  const match = subaccounts.some((s: any) => subs[s._id] === especialidadId);
  return match;
}

// ── 4c. Generate AI summary for client + lawyer ─────────────────────
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
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `Genera un resumen breve y natural de un caso legal basándote en la conversación por email con el cliente. El resumen debe ser profesional, en tercera persona, y mencionar el tipo de caso y las características principales. Incluye a qué abogado ha sido asignado.
Máximo 2-3 frases. No uses formato de lista ni encabezados. Escribe de forma natural.
/no_think`,
        },
        {
          role: 'user',
          content: `Especialidad: ${espName}\nAbogado asignado: ${lawyerName}\n\nConversación:\n${conversationText}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = (response.choices[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (content && content.length > 10) return content;
  } catch (err) {
    console.error('[generateCaseSummary] Error:', err);
  }

  // Fallback
  return `Caso de ${espName}: solicitud recibida por email. Asignado a ${lawyerName}.`;
}

// ── 4d. Assign case to a specific subaccount ─────────────────────────
async function assignCaseToSubaccount(
  email: IncomingEmail,
  accountId: string,
  account: any,
  subaccount: any,
  cuentaCorreo: CuentaCorreo,
  conversationId: string,
  especialidadId?: string,
): Promise<void> {
  const clientId = Date.now().toString();
  const espName = account.especialidades.find((e: any) => e.id === especialidadId)?.nombre || 'General';
  const lawyerName = subaccount.name || subaccount.email;

  // Generate AI summary
  const aiSummary = await generateCaseSummary(email, account, conversationId, espName, lawyerName);

  // Save account first (set autoClientId), then create client
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (conv) conv.autoClientId = clientId;
  await saveAccount(account);

  await Client.create({
    _id: clientId,
    name: email.fromName || email.from,
    email: email.from,
    phone: '',
    cases: 1,
    status: 'abierto',
    summary: aiSummary,
    files: [],
    accountId,
    assignedSubaccountId: subaccount._id,
    clientType: 'particular',
    autoCreated: true,
    fiscalInfo: {},
  });

  const cuentaConfig: CuentaCorreoConfig = {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: decryptPassword(cuentaCorreo.password),
  };

  const lawyerNotification = `Nuevo cliente asignado.\n\nDATOS DEL CLIENTE:\n- Nombre: ${email.fromName || email.from}\n- Email: ${email.from}\n- Especialidad: ${espName}\n\nRESUMEN DEL CASO:\n${aiSummary}\n\n---\nEste cliente ha sido asignado a tu cuenta.`;

  try {
    await sendEmailViaCuenta(
      cuentaConfig,
      subaccount.email,
      `[Nuevo cliente] ${email.fromName || email.from} — ${espName}`,
      lawyerNotification,
    );
  } catch (err) {
    console.error('Error enviando notificación al abogado:', err);
  }
}

// ── 5. Assign case — create client + notify lawyer ──────────────────
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
    console.warn(`[assignCase] No subaccounts available for account ${accountId} — case for ${email.from} not assigned`);
    return;
  }

  let bestSubaccount: any = null;

  if (account.sortByCarga) {
    // Only by workload — ignore specialty (count only open clients)
    const clients = await Client.find({ accountId, status: 'abierto' });
    let minLoad = Infinity;
    for (const sub of subaccounts) {
      const load = clients.filter((c: any) => c.assignedSubaccountId === sub._id).length;
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
      const load = clients.filter((c: any) => c.assignedSubaccountId === sub._id).length;
      if (load < minLoad) { minLoad = load; bestSubaccount = sub; }
    }
  }

  if (!bestSubaccount) return;

  // Update conversation with clientId FIRST, save, THEN create client
  const clientId = Date.now().toString();
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (conv) conv.autoClientId = clientId;
  await saveAccount(account);

  // Now create the client (after account save succeeded)
  const espName = account.especialidades.find((e: any) => e.id === especialidadId)?.nombre || 'General';
  const lawyerName = bestSubaccount.name || bestSubaccount.email;

  // Generate AI summary
  const aiSummary = await generateCaseSummary(email, account, conversationId, espName, lawyerName);

  await Client.create({
    _id: clientId,
    name: email.fromName || email.from,
    email: email.from,
    phone: '',
    cases: 1,
    status: 'abierto',
    summary: aiSummary,
    files: [],
    accountId,
    assignedSubaccountId: bestSubaccount._id,
    clientType: 'particular',
    autoCreated: true,
    fiscalInfo: {},
  });

  // Send email to the assigned lawyer
  const cuentaConfig: CuentaCorreoConfig = {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: decryptPassword(cuentaCorreo.password),
  };

  const lawyerNotification = `Nuevo cliente asignado automáticamente.

DATOS DEL CLIENTE:
- Nombre: ${email.fromName || email.from}
- Email: ${email.from}
- Especialidad: ${espName}

RESUMEN DEL CASO:
${aiSummary}

---
Este cliente ha sido asignado a tu cuenta automáticamente.`;

  try {
    await sendEmailViaCuenta(
      cuentaConfig,
      bestSubaccount.email,
      `[Nuevo cliente] ${email.fromName || email.from} — ${espName}`,
      lawyerNotification,
    );
  } catch (err) {
    console.error('Error enviando notificación al abogado:', err);
  }
}

// ── Delayed reply queue (persisted in MongoDB) ──────────────────────
interface PendingReply {
  cuentaConfig: CuentaCorreoConfig;
  to: string;
  subject: string;
  text: string;
  messageId?: string;
  references?: string;
  scheduledAt: number; // timestamp
  accountId: string;
  conversationId?: string;
}

async function scheduleReply(
  to: string,
  subject: string,
  text: string,
  messageId?: string,
  references?: string,
  accountId?: string,
  conversationId?: string,
): Promise<void> {
  const delayMs = 1 * 60 * 1000; // 1 minuto
  const scheduledAt = Date.now() + delayMs;
  const replyDoc = {
    id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 8),
    to, subject, text, messageId, references,
    scheduledAt, accountId: accountId || '', conversationId,
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
          console.error(`[scheduleReply] Reply to ${reply.to} exceeded ${MAX_RETRIES} retries, discarding`);
          sentIds.push(reply.id);
          continue;
        }

        // Resolve email credentials from account's cuentasCorreo (no plaintext passwords stored)
        const cuentaCorreo = account.cuentasCorreo?.[0];
        if (!cuentaCorreo) {
          console.error(`[scheduleReply] No email account found for ${account._id}, skipping reply to ${reply.to}`);
          sentIds.push(reply.id); // Remove orphaned reply
          continue;
        }
        const cuentaConfig: CuentaCorreoConfig = {
          plataforma: cuentaCorreo.plataforma,
          correo: cuentaCorreo.correo,
          password: decryptPassword(cuentaCorreo.password),
        };
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

// ── Save incoming email attachments to disk ──────────────────────────
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

// ── 6. Add/update email conversation ─────────────────────────────────
function addToConversation(
  account: any,
  email: IncomingEmail,
  isReply: boolean,
  replyText?: string,
): string {
  // Find existing conversation with this contact
  let conv = account.emailConversations.find((c: any) => c.contactEmail === email.from);

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
    };
    account.emailConversations.push(newConv);
    return newConv.id;
  }

  // Add incoming message to existing conversation
  conv.messages.push({
    id: Date.now().toString(),
    from: email.fromName || email.from,
    text: cleanBody.substring(0, 5000),
    time: timeStr,
    sent: false,
    attachments: savedAttachments,
  });
  conv.unread++;
  conv.lastMessageTime = now.toISOString();

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

// ── Apply classify rules to a newly stored conversation ────────────
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
    const prompt = `Tienes una regla de clasificación de emails:\nNombre: "${rule.name}"\nDescripción: "${rule.description}"\nCarpetas destino: "${folderNames}"\n\nAnaliza este email y determina si debe clasificarse según esa regla:\nASUNTO: ${emailSubject}\nCONTENIDO:\n${emailBody.substring(0, 2000)}\n\nResponde SOLO con JSON: {"match": true} o {"match": false}\n/no_think`;
    try {
      const response = await getQwen().chat.completions.create({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.1,
      });
      const text = (response.choices[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
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
      if (folder && !folder.conversationIds.includes(conversationId)) {
        folder.conversationIds.push(conversationId);
        modified = true;
      }
    }
  }
  if (modified) await saveAccount(account);
}

// ── Main pipeline — process one incoming email ───────────────────────
async function processOneEmail(
  email: IncomingEmail,
  accountId: string,
  cuentaCorreo: CuentaCorreo,
): Promise<void> {
  const account = await getAccount(accountId);
  const cuentaConfig: CuentaCorreoConfig = {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: decryptPassword(cuentaCorreo.password),
  };

  // Check if this is a reply to a pending consulta (from consultas emails)
  const fromLower = email.from.toLowerCase();
  const isConsulta = account.correosConsultas.some((c: any) => c.toLowerCase() === fromLower)
    || (account.whatsappCorreosConsultas || []).some((c: any) => c.toLowerCase() === fromLower)
    || email.subject.includes('[Consulta pendiente]');
  if (isConsulta) {
    const handled = await processConsultaReply(email, accountId);
    if (handled) return;
  }

  // Check if this is a client reply to a pending confirmation
  const pendingConfirmation = account.pendingConsultas.find(
    (p: any) => p.type === 'confirmacion_asignacion'
      && p.originalFrom.toLowerCase() === fromLower
  );
  if (pendingConfirmation) {
    const handled = await processConsultaReply(email, accountId);
    if (handled) return;
  }

  // Check if auto-reply is paused for this contact's conversation
  const existingConv = account.emailConversations.find((c: any) => c.contactEmail === email.from);
  if (existingConv?.autoReplyPaused) {
    // Auto-reply paused — just store the message, no AI processing
    const convIdPaused = addToConversation(account, email, false);
    await saveAccount(account);
    await applyClassifyRules(account, convIdPaused, email.subject, email.body);
    return;
  }

  // ── Emails with attachments: skip AI, forward directly to consultas ──
  if (email.attachments && email.attachments.length > 0 && account.switchActivo) {
    const convId = addToConversation(account, email, false);
    await saveAccount(account);
    await applyClassifyRules(account, convId, email.subject, email.body);
    if (account.correosConsultas.length > 0) {
      await forwardToConsultas(cuentaConfig, account.correosConsultas, email, account, cuentaCorreo.id, convId);
    }
    return;
  }

  // Build conversation history context for all AI calls
  const historyContext = (existingConv?.messages?.length ?? 0) > 0
    ? await buildEmailHistoryText(existingConv!.messages, existingConv!.contactName || email.from)
    : '';

  // Classify the email
  const classification = await classifyEmail(
    email.body,
    email.subject,
    account.especialidades,
    historyContext,
  );

  // ── Email selection filters ──
  const respondConsultas = account.respondConsultasGenerales !== false;
  const respondSolicitudes = account.respondSolicitudesServicio !== false;
  const soloConocidos = account.soloContactosConocidos === true;

  if (soloConocidos && !existingConv && classification.type !== 'otro') {
    // Only respond to known contacts — this is a new contact, just store
    const convIdSolo = addToConversation(account, email, false);
    await saveAccount(account);
    await applyClassifyRules(account, convIdSolo, email.subject, email.body);
    return;
  }

  if (classification.type === 'consulta_general' && !respondConsultas) {
    // General queries disabled — store but don't auto-respond
    const convIdCg = addToConversation(account, email, false);
    await saveAccount(account);
    await applyClassifyRules(account, convIdCg, email.subject, email.body);
    return;
  }

  if (classification.type === 'solicitud_servicio' && !respondSolicitudes) {
    // Service requests disabled — store but don't auto-manage
    const convIdSs = addToConversation(account, email, false);
    await saveAccount(account);
    await applyClassifyRules(account, convIdSs, email.subject, email.body);
    return;
  }

  if (classification.type === 'otro') {
    // Just store the conversation, no action
    const convIdOtro = addToConversation(account, email, false);
    await saveAccount(account);
    await applyClassifyRules(account, convIdOtro, email.subject, email.body);
    return;
  }

  if (classification.type === 'consulta_general') {
    // Try to answer from KB
    const kbContext = getKBContext(account);
    const kbResult = await findAnswerInKB(email.body, email.subject, kbContext, historyContext);

    if (kbResult.found && kbResult.answer) {
      // Schedule delayed reply
      const convId = addToConversation(account, email, false);
      await saveAccount(account);
      await applyClassifyRules(account, convId, email.subject, email.body);
      await scheduleReply(email.from, email.subject, kbResult.answer, email.messageId, email.references, accountId, convId);
    } else {
      // Forward to consultas
      const convId = addToConversation(account, email, false);
      await saveAccount(account);
      await applyClassifyRules(account, convId, email.subject, email.body);
      await forwardToConsultas(cuentaConfig, account.correosConsultas, email, account, cuentaCorreo.id, convId);
    }
    return;
  }

  if (classification.type === 'solicitud_servicio') {
    // Check if auto-assign is enabled
    if (!account.autoAssignEnabled) {
      // Auto-assign disabled — just store conversation, no forwarding
      const convIdNoAssign = addToConversation(account, email, false);
      await saveAccount(account);
      await applyClassifyRules(account, convIdNoAssign, email.subject, email.body);
      return;
    }

    const canAssign = await hasMatchingSpecialist(accountId, account, classification.especialidadId);

    if (canAssign) {
      // Check if client explicitly requests assignment
      const explicitRequest = await detectExplicitAssignmentRequest(email.body, email.subject);

      if (explicitRequest) {
        // Client explicitly asked for assignment — assign directly
        const convId = addToConversation(account, email, false);
        await saveAccount(account);
        await applyClassifyRules(account, convId, email.subject, email.body);
        await assignCase(email, accountId, account, classification.especialidadId, cuentaCorreo, convId);

        const confirmMsg = 'Perfecto, le hemos asignado un abogado especializado. Se pondrá en contacto con usted en breve.';
        await scheduleReply(email.from, email.subject, confirmMsg, email.messageId, email.references, accountId, convId);
        await saveAccount(account);
      } else {
        // Ask client before assigning
        const espName = account.especialidades.find((e: any) => e.id === classification.especialidadId)?.nombre || 'su caso';
        const askMsg = `Hemos recibido su solicitud. Contamos con abogados especializados en ${espName}. ¿Le gustaría que le asignemos un abogado para su caso? Responda a este email para confirmar.`;
        await scheduleReply(email.from, email.subject, askMsg, email.messageId, email.references, accountId);
        const convId = addToConversation(account, email, true, askMsg);
        await applyClassifyRules(account, convId, email.subject, email.body);
        // Save pending confirmation on same account object (avoid race condition)
        account.pendingConsultas.push({
          id: Date.now().toString(),
          originalFrom: email.from,
          originalFromName: email.fromName,
          originalSubject: email.subject,
          originalBody: stripQuotedText(email.body),
          cuentaCorreoId: cuentaCorreo.id,
          conversationId: convId,
          forwardedAt: new Date().toISOString(),
          type: 'confirmacion_asignacion',
          especialidadId: classification.especialidadId,
          channel: 'email',
        });
        await saveAccount(account);
      }
    } else {
      // No specialist — neutral reply + forward to consultas for decision
      const neutralMsg = 'Hemos recibido su solicitud. La estamos revisando y le responderemos en breve.';
      const convId = addToConversation(account, email, false);
      await saveAccount(account);
      await applyClassifyRules(account, convId, email.subject, email.body);
      await scheduleReply(email.from, email.subject, neutralMsg, email.messageId, email.references, accountId, convId);
      const espName = account.especialidades.find((e: any) => e.id === classification.especialidadId)?.nombre || 'desconocida';
      await forwardToConsultas(cuentaConfig, account.correosConsultas, email, account, cuentaCorreo.id, convId, 'solicitud_sin_especialista', espName, classification.especialidadId);
    }
  }
}

// ── Polling management ───────────────────────────────────────────────
const pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();

export async function processIncomingEmails(accountId: string): Promise<number> {
  return withAccountLock(accountId, async () => {
    const account = await getAccount(accountId);

    let totalProcessed = 0;

    for (const cuentaCorreo of account.cuentasCorreo) {
      const cuentaConfig: CuentaCorreoConfig = {
        plataforma: cuentaCorreo.plataforma,
        correo: cuentaCorreo.correo,
        password: decryptPassword(cuentaCorreo.password),
      };

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
                addToConversation(account, email, false);
                await saveAccount(account);
              }
              totalProcessed += senderEmails.length;
              continue;
            }

            if (senderEmails.length === 1) {
              // Single email — process normally
              await processOneEmail(senderEmails[0], accountId, cuentaCorreo);
            } else {
              // Multiple emails from same sender — store all, but only AI-process the merged version
              // Store all individual messages in the conversation first
              for (let i = 0; i < senderEmails.length - 1; i++) {
                addToConversation(account, senderEmails[i], false);
              }
              await saveAccount(account);

              // Merge bodies into the last email for AI processing
              const lastEmail = senderEmails[senderEmails.length - 1];
              const mergedBody = senderEmails.map(e => e.body).join('\n\n---\n\n');
              const mergedEmail: IncomingEmail = {
                ...lastEmail,
                body: mergedBody.substring(0, 10000),
                // Merge attachments from all emails
                attachments: senderEmails.flatMap(e => e.attachments || []),
              };
              await processOneEmail(mergedEmail, accountId, cuentaCorreo);
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
  });
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

// ── Get conversations for frontend ───────────────────────────────────
export async function getEmailConversations(accountId: string): Promise<EmailConversation[]> {
  const account = await getAccount(accountId);
  return account.emailConversations || [];
}

// ── Get pending consultas for frontend ───────────────────────────────
export async function getPendingConsultas(accountId: string): Promise<PendingConsulta[]> {
  const account = await getAccount(accountId);
  return account.pendingConsultas || [];
}

// ── Mark conversation as read ────────────────────────────────────────
export async function markConversationRead(accountId: string, conversationId: string): Promise<void> {
  const account = await getAccount(accountId);
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (conv && conv.unread > 0) {
    conv.unread = 0;
    await saveAccount(account);
  }
}

// ── Delete conversation ──────────────────────────────────────────────
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
      const result = await Client.deleteOne({ _id: conv.autoClientId });
      if (result.deletedCount > 0) {
      }
    } catch (err) {
      console.error('[Email] Error deleting auto-created client:', err);
    }
  }
}

// ── Toggle auto-reply for individual conversation ───────────
export async function toggleConversationAutoReply(accountId: string, conversationId: string, paused: boolean): Promise<boolean> {
  const account = await getAccount(accountId);
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (!conv) return false;
  conv.autoReplyPaused = paused;
  await saveAccount(account);
  return true;
}

// ── Send manual email from a conversation ────────────────────
export async function sendManualEmail(
  accountId: string,
  conversationId: string,
  text: string,
  attachmentFiles?: Array<{ id: string; filename: string; originalName: string; mimeType: string; size: number; path: string }>,
): Promise<boolean> {
  const account = await getAccount(accountId);
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (!conv) return false;

  // Find the email account to send from
  const cuentaCorreo = account.cuentasCorreo[0];
  if (!cuentaCorreo) return false;

  const cuentaConfig: CuentaCorreoConfig = {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: decryptPassword(cuentaCorreo.password),
  };

  // Save message BEFORE sending so it's not lost if SMTP succeeds but save fails
  const timeStr = new Date().toISOString();
  const msgAttachments = attachmentFiles?.map(a => ({
    id: a.id,
    filename: a.filename,
    originalName: a.originalName,
    mimeType: a.mimeType,
    size: a.size,
  }));
  const newMsg = {
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
    const smtpAttachments = attachmentFiles?.map(a => ({ filename: a.originalName, path: a.path }));
    await replyToEmail(cuentaConfig, conv.contactEmail, conv.subject, text, undefined, undefined, smtpAttachments);

    return true;
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
    return false;
  }
}

// ── Resume polling for all active accounts on server startup ─────────
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
