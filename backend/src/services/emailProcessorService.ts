import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import {
  fetchUnreadEmails,
  sendEmailViaCuenta,
  replyToEmail,
  type CuentaCorreoConfig,
  type IncomingEmail,
} from './emailService.js';
import { Automation } from '../models/Automation.js';
import { Client } from '../models/Client.js';
import { Subaccount } from '../models/Subaccount.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads/automatizaciones');

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
  return doc;
}

async function saveAccount(account: any): Promise<void> {
  // Convert to plain objects to avoid Mongoose serialization issues with mixed subdocuments
  const plain = typeof account.toObject === 'function' ? account.toObject() : account;
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
    }
  }, { upsert: true });
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

// ── 1. Classify email with Mistral ───────────────────────────────────
async function classifyEmail(
  emailBody: string,
  emailSubject: string,
  especialidades: Especialidad[],
): Promise<{ type: 'consulta_general' | 'solicitud_servicio' | 'otro'; especialidadId?: string }> {
  const espList = especialidades.map(e => `- ID: ${e.id} | Nombre: "${e.nombre}" | Descripción: "${e.descripcion}"`).join('\n');

  const prompt = `Analiza el siguiente email y clasifícalo en una de estas categorías:
1. "consulta_general" — El remitente hace una pregunta general, pide información (horarios, precios, servicios, disponibilidad, etc.), o cualquier mensaje de una persona real que contenga una pregunta o solicitud de información
2. "solicitud_servicio" — El remitente solicita un servicio legal concreto, necesita un abogado, tiene un caso legal, quiere contratar servicios
3. "otro" — SOLO para spam, publicidad, newsletters, notificaciones automáticas de sistemas, o emails claramente generados por máquinas que no contienen ninguna pregunta ni solicitud de una persona real

IMPORTANTE: Si hay CUALQUIER duda sobre la categoría, clasifica como "consulta_general". Solo usa "otro" si estás COMPLETAMENTE SEGURO de que es spam o un email automático sin contenido humano.

${especialidades.length > 0 ? `Si es "solicitud_servicio", indica qué especialidad encaja mejor de las siguientes. IMPORTANTE: Si NINGUNA especialidad encaja con lo que pide el cliente, devuelve "especialidadId": null\n${espList}` : ''}

Responde SOLO con JSON: {"type": "consulta_general"|"solicitud_servicio"|"otro"${especialidades.length > 0 ? ', "especialidadId": "id_de_la_especialidad o null si ninguna encaja"' : ''}}

ASUNTO: ${emailSubject}
CONTENIDO:
${emailBody.substring(0, 3000)}`;

  try {
    const response = await getQwen().chat.completions.create({
      model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
      messages: [{ role: 'user', content: prompt + '\n/no_think' }],
      max_tokens: 200,
      temperature: 0.1,
    });

    const text = (response.choices[0].message.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    console.log('[classifyEmail] Qwen raw:', text);
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
      console.log('[classifyEmail] Parsed:', JSON.stringify(parsed));
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
): Promise<{ found: boolean; answer?: string }> {
  if (!kbContext.trim()) return { found: false };

  try {
    const response = await getQwen().chat.completions.create({
      model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
      messages: [
        {
          role: 'system',
          content: `Eres el asistente de un despacho de abogados. Responde preguntas basándote ÚNICAMENTE en la información de los documentos proporcionados. Si no tienes información suficiente para responder, di exactamente "NO_TENGO_INFO". Sé profesional y conciso.

DOCUMENTOS DEL DESPACHO:
${kbContext.substring(0, 8000)}`,
        },
        {
          role: 'user',
          content: `Responde a este email:\nAsunto: ${emailSubject}\n\n${emailBody.substring(0, 2000)}`,
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
): Promise<string> {
  try {
    const response = await getQwen().chat.completions.create({
      model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
      messages: [
        {
          role: 'system',
          content: `Eres el asistente de email de un despacho de abogados. Tu tarea es redactar una respuesta breve y profesional para enviar a un cliente.

Se te proporcionará:
1. La pregunta original del cliente
2. La instrucción/información que te da el responsable del despacho

Reglas ESTRICTAS:
- Usa ÚNICAMENTE la información que te da el responsable. NO añadas, inventes ni amplíes información bajo ningún concepto
- NO incluyas firmas, nombres, teléfonos, correos ni datos de contacto. NUNCA pongas placeholders como "[Nombre]", "[Teléfono]", "[Despacho]" ni similares
- Sé breve y directo: un saludo corto, la información solicitada, y una despedida corta ("Un saludo" es suficiente)
- No inventes descripciones de productos, servicios ni características que no estén en la instrucción del responsable
- Responde en el mismo idioma que el cliente
- No menciones que alguien te dio instrucciones`,
        },
        {
          role: 'user',
          content: `PREGUNTA DEL CLIENTE:\nAsunto: ${originalSubject}\n${originalBody.substring(0, 2000)}\n\nINSTRUCCIÓN DEL RESPONSABLE:\n${rawInstruction.substring(0, 2000)}\n/no_think`,
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

  let forwardBody: string;
  if (type === 'solicitud_sin_especialista') {
    forwardBody = `Se ha recibido una solicitud de servicio de "${especialidadNombre || 'especialidad desconocida'}" pero no hay ningún abogado asignado a esa especialidad.

DE: ${email.fromName} <${email.from}>
ASUNTO: ${email.subject}
MENSAJE:
${email.body}

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
${email.body}

---
Responde a este email con las instrucciones para la respuesta.
También puedes escribir "pausa la respuesta automática" para desactivar las respuestas automáticas de este cliente.`;
  }

  for (const consultaEmail of correosConsultas) {
    await sendEmailViaCuenta(cuenta, consultaEmail, `[Consulta pendiente] ${email.subject}`, forwardBody);
  }

  // Save pending consulta on the caller's account object (avoid race condition)
  account.pendingConsultas.push({
    id: Date.now().toString(),
    originalFrom: email.from,
    originalFromName: email.fromName,
    originalSubject: email.subject,
    originalBody: email.body,
    cuentaCorreoId,
    conversationId,
    forwardedAt: new Date().toISOString(),
    type,
    especialidadId,
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

    // Outlook separator line
    if (trimmed.startsWith('________________________________')) break;

    // Outlook From/Sent block
    if (/^From:\s+/i.test(trimmed) && i + 1 < lines.length && /^Sent:\s+/i.test(lines[i + 1].trim())) break;
    if (/^De:\s+/i.test(trimmed) && i + 1 < lines.length && /^Enviado:\s+/i.test(lines[i + 1].trim())) break;

    // Block of quoted lines (all remaining lines start with >)
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
      model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
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
    console.log('[interpretConsultaAction] AI raw response:', content);

    // Remove <think>...</think> blocks if present
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[interpretConsultaAction] Parsed:', JSON.stringify(parsed));
      return parsed;
    }
    console.warn('[interpretConsultaAction] No valid JSON found in AI response');
  } catch (err) {
    console.error('Error interpretando respuesta de consulta:', err);
  }

  // Fallback: reject with no message (will use generic safe message)
  return { action: 'reject' };
}

// ── 3c. Interpret client confirmation (affirmative/negative) ──────────
async function interpretClientConfirmation(replyText: string): Promise<boolean> {
  try {
    const response = await getQwen().chat.completions.create({
      model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
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
      model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
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
      console.log('[detectExplicitAssignment]', parsed);
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
    (p: any) => reply.subject.includes(p.originalSubject)
      || reply.subject.includes('[Consulta pendiente]')
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
    password: cuentaCorreo.password,
  };

  if (pending.type === 'confirmacion_asignacion') {
    // ── Client replied to assignment confirmation ──
    const conv = account.emailConversations.find((c: any) => c.id === pending.conversationId);
    const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Add client's reply to conversation
    if (conv) {
      conv.messages.push({ id: Date.now().toString(), from: conv.contactName || pending.originalFromName, text: cleanReply, time: timeStr, sent: false });
      conv.unread++;
      conv.lastMessageTime = new Date().toISOString();
    }

    // Use AI to determine if the reply is affirmative or negative
    const isAffirmative = await interpretClientConfirmation(cleanReply);
    console.log(`[processConsultaReply] Client confirmation: "${cleanReply}" -> affirmative=${isAffirmative}`);

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
    const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

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
      console.log(`[processConsultaReply] Auto-reply paused for conversation ${pending.conversationId}`);
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
      console.log(`[processConsultaReply] Auto-reply paused for conversation ${pending.conversationId} (consulta_general)`);

      account.pendingConsultas.splice(pendingIdx, 1);
      await saveAccount(account);
      return true;
    }

    // Normal flow: save KB doc + reply
    const docId = Date.now().toString();
    const docFilename = `consulta_${docId}.txt`;
    const docPath = path.join(UPLOADS_DIR, docFilename);

    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    const docContent = `Respuesta a consulta sobre: ${pending.originalSubject}\n\nPregunta original: ${pending.originalBody}\n\nRespuesta: ${cleanReply}`;
    fs.writeFileSync(docPath, docContent, 'utf-8');

    account.documentos.push({
      id: docId,
      nombre: `Respuesta consulta: ${pending.originalSubject.substring(0, 50)}`,
      filename: docFilename,
      extractedText: docContent,
      uploadedAt: new Date().toISOString(),
    });

    // Compose professional reply from raw instruction
    const composedReply = await composeClientReply(pending.originalSubject, pending.originalBody, cleanReply);
    await replyToEmail(cuentaConfig, pending.originalFrom, pending.originalSubject, composedReply);
    const conv = account.emailConversations.find((c: any) => c.id === pending.conversationId);
    if (conv) {
      conv.messages.push({
        id: Date.now().toString(),
        from: 'Asistente',
        text: composedReply,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
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
  if (subaccounts.length === 0) { console.log('[hasMatchingSpecialist] No subaccounts'); return false; }
  if (account.sortByCarga) { console.log('[hasMatchingSpecialist] sortByCarga=true, assigning by load'); return true; }
  if (!especialidadId) { console.log('[hasMatchingSpecialist] No especialidadId — no specialist match'); return false; }
  const subs = account.subcuentaEspecialidades || {};
  const match = subaccounts.some((s: any) => subs[s._id] === especialidadId);
  console.log(`[hasMatchingSpecialist] especialidadId=${especialidadId}, match=${match}`);
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
      model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
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

  // Set autoClientId directly on passed account (avoid race condition)
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (conv) conv.autoClientId = clientId;

  const cuentaConfig: CuentaCorreoConfig = {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: cuentaCorreo.password,
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
  if (subaccounts.length === 0) return;

  let bestSubaccount: any = null;

  if (account.sortByCarga) {
    // Only by workload — ignore specialty
    const clients = await Client.find({ accountId });
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
    const clients = await Client.find({ accountId });
    let minLoad = Infinity;
    for (const sub of pool) {
      const load = clients.filter((c: any) => c.assignedSubaccountId === sub._id).length;
      if (load < minLoad) { minLoad = load; bestSubaccount = sub; }
    }
  }

  if (!bestSubaccount) return;

  // Create auto client
  const clientId = Date.now().toString();
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

  // Update conversation with clientId
  // Set autoClientId directly on passed account (avoid race condition)
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (conv) conv.autoClientId = clientId;

  // Send email to the assigned lawyer
  const cuentaConfig: CuentaCorreoConfig = {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: cuentaCorreo.password,
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

// ── Delayed reply queue (5-15 min random delay) ──────────────────────
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

const pendingReplies: PendingReply[] = [];

function scheduleReply(
  cuentaConfig: CuentaCorreoConfig,
  to: string,
  subject: string,
  text: string,
  messageId?: string,
  references?: string,
  accountId?: string,
  conversationId?: string,
): void {
  const delayMs = (5 + Math.random() * 10) * 60 * 1000; // 5-15 min
  const scheduledAt = Date.now() + delayMs;
  pendingReplies.push({
    cuentaConfig, to, subject, text, messageId, references,
    scheduledAt, accountId: accountId || '', conversationId,
  });
  console.log(`[scheduleReply] Queued reply to ${to}, will send in ${Math.round(delayMs / 60000)} min`);
}

async function processPendingReplies(): Promise<void> {
  const now = Date.now();
  const due = pendingReplies.filter(r => r.scheduledAt <= now);
  if (due.length === 0) return;

  for (const reply of due) {
    try {
      await replyToEmail(reply.cuentaConfig, reply.to, reply.subject, reply.text, reply.messageId, reply.references);
      console.log(`[scheduleReply] Sent delayed reply to ${reply.to}`);

      // Update conversation with the reply message
      if (reply.accountId && reply.conversationId) {
        const account = await getAccount(reply.accountId);
        const conv = account.emailConversations.find((c: any) => c.id === reply.conversationId);
        if (conv) {
          const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          conv.messages.push({
            id: Date.now().toString(),
            from: 'Asistente',
            text: reply.text,
            time: timeStr,
            sent: true,
          });
          conv.lastMessageTime = new Date().toISOString();
          await saveAccount(account);
        }
      }
    } catch (err) {
      console.error(`[scheduleReply] Error sending to ${reply.to}:`, err);
    }

    const idx = pendingReplies.indexOf(reply);
    if (idx >= 0) pendingReplies.splice(idx, 1);
  }
}

// Start processing pending replies every 30 seconds
setInterval(() => {
  processPendingReplies().catch(err =>
    console.error('[scheduleReply] Error processing queue:', err)
  );
}, 30 * 1000);

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
  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  if (!conv) {
    const incomingMsg: any = {
      id: Date.now().toString(),
      from: email.fromName || email.from,
      text: email.body.substring(0, 5000),
      time: timeStr,
      sent: false,
    };
    const msgs: any[] = [incomingMsg];

    if (isReply && replyText) {
      msgs.push({
        id: (Date.now() + 1).toString(),
        from: 'Asistente',
        text: replyText,
        time: timeStr,
        sent: true,
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
    text: email.body.substring(0, 5000),
    time: timeStr,
    sent: false,
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
    });
  }

  return conv.id;
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
    password: cuentaCorreo.password,
  };

  // Check if this is a reply to a pending consulta (from consultas emails)
  const fromLower = email.from.toLowerCase();
  const isConsulta = account.correosConsultas.some((c: any) => c.toLowerCase() === fromLower)
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
    addToConversation(account, email, false);
    await saveAccount(account);
    console.log(`[Email] Auto-reply paused for ${email.from}, storing only`);
    return;
  }

  // Classify the email
  const classification = await classifyEmail(
    email.body,
    email.subject,
    account.especialidades,
  );

  if (classification.type === 'otro') {
    // Just store the conversation, no action
    addToConversation(account, email, false);
    await saveAccount(account);
    return;
  }

  if (classification.type === 'consulta_general') {
    // Try to answer from KB
    const kbContext = getKBContext(account);
    const kbResult = await findAnswerInKB(email.body, email.subject, kbContext);

    if (kbResult.found && kbResult.answer) {
      // Schedule delayed reply
      const convId = addToConversation(account, email, false);
      await saveAccount(account);
      scheduleReply(cuentaConfig, email.from, email.subject, kbResult.answer, email.messageId, email.references, accountId, convId);
    } else {
      // Forward to consultas
      const convId = addToConversation(account, email, false);
      await saveAccount(account);
      await forwardToConsultas(cuentaConfig, account.correosConsultas, email, account, cuentaCorreo.id, convId);
    }
    return;
  }

  if (classification.type === 'solicitud_servicio') {
    // Check if auto-assign is enabled
    if (!account.autoAssignEnabled) {
      // Auto-assign disabled — just store conversation, no forwarding
      addToConversation(account, email, false);
      await saveAccount(account);
      console.log(`[Email] Auto-assign disabled, storing only for ${email.from}`);
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
        await assignCase(email, accountId, account, classification.especialidadId, cuentaCorreo, convId);

        const confirmMsg = 'Perfecto, le hemos asignado un abogado especializado. Se pondrá en contacto con usted en breve.';
        scheduleReply(cuentaConfig, email.from, email.subject, confirmMsg, email.messageId, email.references, accountId, convId);
        await saveAccount(account);
      } else {
        // Ask client before assigning
        const espName = account.especialidades.find((e: any) => e.id === classification.especialidadId)?.nombre || 'su caso';
        const askMsg = `Hemos recibido su solicitud. Contamos con abogados especializados en ${espName}. ¿Le gustaría que le asignemos un abogado para su caso? Responda a este email para confirmar.`;
        scheduleReply(cuentaConfig, email.from, email.subject, askMsg, email.messageId, email.references, accountId);
        const convId = addToConversation(account, email, true, askMsg);
        // Save pending confirmation on same account object (avoid race condition)
        account.pendingConsultas.push({
          id: Date.now().toString(),
          originalFrom: email.from,
          originalFromName: email.fromName,
          originalSubject: email.subject,
          originalBody: email.body,
          cuentaCorreoId: cuentaCorreo.id,
          conversationId: convId,
          forwardedAt: new Date().toISOString(),
          type: 'confirmacion_asignacion',
          especialidadId: classification.especialidadId,
        });
        await saveAccount(account);
      }
    } else {
      // No specialist — neutral reply + forward to consultas for decision
      const neutralMsg = 'Hemos recibido su solicitud. La estamos revisando y le responderemos en breve.';
      const convId = addToConversation(account, email, false);
      await saveAccount(account);
      scheduleReply(cuentaConfig, email.from, email.subject, neutralMsg, email.messageId, email.references, accountId, convId);
      const espName = account.especialidades.find((e: any) => e.id === classification.especialidadId)?.nombre || 'desconocida';
      await forwardToConsultas(cuentaConfig, account.correosConsultas, email, account, cuentaCorreo.id, convId, 'solicitud_sin_especialista', espName, classification.especialidadId);
    }
  }
}

// ── Polling management ───────────────────────────────────────────────
const pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();

export async function processIncomingEmails(accountId: string): Promise<number> {
  const account = await getAccount(accountId);
  if (!account.switchActivo) return 0;

  let totalProcessed = 0;

  for (const cuentaCorreo of account.cuentasCorreo) {
    const cuentaConfig: CuentaCorreoConfig = {
      plataforma: cuentaCorreo.plataforma,
      correo: cuentaCorreo.correo,
      password: cuentaCorreo.password,
    };

    try {
      const emails = await fetchUnreadEmails(cuentaConfig);
      for (const email of emails) {
        try {
          await processOneEmail(email, accountId, cuentaCorreo);
          totalProcessed++;
        } catch (err) {
          console.error(`Error procesando email de ${email.from}:`, err);
        }
      }
    } catch (err) {
      console.error(`Error fetching emails de ${cuentaCorreo.correo}:`, err);
    }
  }

  return totalProcessed;
}

export function startPolling(accountId: string): void {
  if (pollingIntervals.has(accountId)) return;

  console.log(`[Email] Polling started for account ${accountId}`);

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
    console.log(`[Email] Polling stopped for account ${accountId}`);
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
    console.log(`[Email] Deleted ${removedPending} pendingConsulta(s) for conversation ${conversationId}`);
  }

  await saveAccount(account);

  // Remove auto-created client if exists
  if (conv?.autoClientId) {
    try {
      const result = await Client.deleteOne({ _id: conv.autoClientId });
      if (result.deletedCount > 0) {
        console.log(`[Email] Deleted auto-created client ${conv.autoClientId} for conversation ${conversationId}`);
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
  console.log(`[Email] Auto-reply ${paused ? 'paused' : 'resumed'} for conversation ${conversationId}`);
  return true;
}

// ── Send manual email from a conversation ────────────────────
export async function sendManualEmail(accountId: string, conversationId: string, text: string): Promise<boolean> {
  const account = await getAccount(accountId);
  const conv = account.emailConversations.find((c: any) => c.id === conversationId);
  if (!conv) return false;

  // Find the email account to send from
  const cuentaCorreo = account.cuentasCorreo[0];
  if (!cuentaCorreo) return false;

  const cuentaConfig: CuentaCorreoConfig = {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: cuentaCorreo.password,
  };

  try {
    await replyToEmail(cuentaConfig, conv.contactEmail, conv.subject, text);

    const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    conv.messages.push({
      id: Date.now().toString(),
      from: 'Asistente',
      text,
      time: timeStr,
      sent: true,
    });
    conv.lastMessageTime = new Date().toISOString();
    await saveAccount(account);

    console.log(`[Email] Manual email sent to ${conv.contactEmail} in conversation ${conversationId}`);
    return true;
  } catch (err) {
    console.error('[Email] Error sending manual email:', err);
    return false;
  }
}

// ── Resume polling for all active accounts on server startup ─────────
export async function resumeAllPolling(): Promise<void> {
  try {
    const allDocs = await Automation.find({ switchActivo: true });
    for (const doc of allDocs) {
      if (doc.cuentasCorreo.length > 0) {
        console.log(`[Email] Resuming polling for account ${doc._id}`);
        startPolling(doc._id);
      }
    }
  } catch (err) {
    console.error('[Email] Error resuming polling on startup:', err);
  }
}
