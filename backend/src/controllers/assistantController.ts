import { Request, Response } from 'express';
import fs from 'fs/promises';
import { callAssistantAI, streamAssistantAI, buildContextMessages } from '../services/aiService.js';
import { getAccountSpecialties } from '../services/specialtiesService.js';
import { getLegalContextForAccount, buildCountryLegalSystemPrompt, getAccountCountry } from '../services/legalKnowledgeService.js';
import { hasLegalIntent } from '../services/legalIntentService.js';
import { AssistantChat } from '../models/AssistantChat.js';
import { DailyIaUsage } from '../models/DailyIaUsage.js';
import { Subscription } from '../models/Subscription.js';
import { verifyOwnership } from '../middleware/auth.js';

async function checkIaMessageLimit(accountId: string): Promise<{ allowed: boolean; remaining: number }> {
  const subscription = await Subscription.findOne({ accountId });
  if (!subscription || subscription.plan !== 'free') {
    return { allowed: true, remaining: Infinity };
  }
  const today = new Date().toISOString().slice(0, 10);
  const usage = await DailyIaUsage.findOne({ accountId, date: today });
  const count = usage?.count || 0;
  if (count >= 50) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: 50 - count };
}

async function incrementIaMessageCount(accountId: string, increment: number = 1) {
  const today = new Date().toISOString().slice(0, 10);
  await DailyIaUsage.updateOne(
    { accountId, date: today },
    { $inc: { count: increment } },
    { upsert: true }
  );
}

// ── Subir archivo y extraer texto ──────────────────────────────────────────
export const uploadAssistantFile = async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

  const { path: filePath, originalname, mimetype } = req.file;

  const { accountId } = req.body;
  if (accountId) {
    const subscription = await Subscription.findOne({ accountId });
    if (subscription && subscription.plan === 'free') {
      await fs.unlink(filePath).catch(() => {});
      return res.status(403).json({ error: 'El plan Sin Cargo no permite subir archivos para mejorar la IA' });
    }
  }

  let text = '';

  try {
    if (mimetype === 'application/pdf') {
      const pdfBuffer = await fs.readFile(filePath);
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: pdfBuffer });
      try {
        const result = await parser.getText();
        text = result.text || '';
      } finally {
        await parser.destroy().catch(() => {});
      }
    } else {
      text = await fs.readFile(filePath, 'utf-8');
    }

    // Limitar tamaño de contexto
    const MAX_CHARS = 25000;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + '\n\n[... documento truncado por longitud ...]';
    }

    res.json({ fileName: originalname, text, textLength: text.length });
  } catch (error) {
    console.error('Error procesando archivo del asistente:', error);
    res.status(500).json({ error: 'No se pudo procesar el archivo' });
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Obtener lista de chats de una cuenta
export const getAssistantChats = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const listFilter: any = { accountId };
    const user = (req as any).user;
    listFilter.createdBy = user?.userId || '';

    const docs = await AssistantChat.find(listFilter).lean();
    const accountChats = docs.map((c) => ({
      id: c._id,
      name: c.name,
      createdAt: c.createdAt,
      messageCount: c.messages.length
    }));

    res.json({ chats: accountChats });
  } catch (error) {
    console.error('Error al obtener chats de asistente:', error);
    res.status(500).json({ error: 'Error al obtener chats de asistente' });
  }
};

// Obtener un chat específico
export const getAssistantChat = async (req: Request, res: Response) => {
  try {
    const { accountId, chatId } = req.query;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    let chat;
    const user = (req as any).user;
    if (chatId && typeof chatId === 'string') {
      chat = await AssistantChat.findOne({ _id: chatId, accountId, createdBy: user?.userId || '' });
    } else {
      // Retrocompatibilidad: devolver el primer chat de la cuenta
      chat = await AssistantChat.findOne({ accountId, createdBy: user?.userId || '' });
    }

    const json = chat?.toJSON() as any;
    res.json({ 
      id: json?.id,
      name: json?.name,
      messages: json?.messages || [] 
    });
  } catch (error) {
    console.error('Error al obtener chat de asistente:', error);
    res.status(500).json({ error: 'Error al obtener chat de asistente' });
  }
};

// Crear nuevo chat
export const createAssistantChat = async (req: Request, res: Response) => {
  try {
    const { accountId, name } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const count = await AssistantChat.countDocuments({ accountId });

    const user = (req as any).user;
    const newChat = await AssistantChat.create({
      _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      accountId,
      createdBy: user?.userId || '',
      name: name || `Chat ${count + 1}`,
      createdAt: new Date().toISOString(),
      messages: []
    });

    const json = newChat.toJSON() as any;
    res.json({ 
      id: json.id, 
      name: json.name, 
      createdAt: json.createdAt 
    });
  } catch (error) {
    console.error('Error al crear chat de asistente:', error);
    res.status(500).json({ error: 'Error al crear chat de asistente' });
  }
};

export const sendAssistantMessage = async (req: Request, res: Response) => {
  try {
    const { accountId, chatId, content } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const limitCheck = await checkIaMessageLimit(accountId);
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: 'Has alcanzado el límite diario de 50 mensajes en el plan Sin Cargo. Suscríbete a un plan de pago para continuar.' });
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content es requerido' });
    }

    const user = (req as any).user;
    let accountChat;
    if (chatId && typeof chatId === 'string') {
      accountChat = await AssistantChat.findOne({ _id: chatId, accountId, createdBy: user?.userId || '' });
    } else {
      // Retrocompatibilidad: usar el primer chat de la cuenta
      accountChat = await AssistantChat.findOne({ accountId, createdBy: user?.userId || '' });
    }

    if (!accountChat) {
      // Crear un nuevo chat si no existe
      accountChat = new AssistantChat({
        _id: chatId || Date.now().toString() + Math.random().toString(36).substr(2, 9),
        accountId,
        createdBy: user?.userId || '',
        name: 'Chat General',
        createdAt: new Date().toISOString(),
        messages: []
      });
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim()
    };
    accountChat.messages.push(userMessage);

    const selectedSpecialties = await getAccountSpecialties(accountId);

    const accountCountry = await getAccountCountry(accountId);

    let legalCountryPrompt = '';
    if (hasLegalIntent(content.trim(), selectedSpecialties)) {
      const legalContext = await getLegalContextForAccount(accountId, content.trim(), selectedSpecialties, 5000, 'assistant');
      legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
    }

    const { contextMessages: assistCtx, newSummary: assistSummary } = await buildContextMessages(accountChat.messages as any, accountChat.summary);
    if (assistSummary !== null) { accountChat.summary = assistSummary; }

    const aiResponse = await callAssistantAI(assistCtx, selectedSpecialties, legalCountryPrompt || undefined, accountCountry);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: aiResponse
    };

    accountChat.messages.push(assistantMessage);
    await accountChat.save();

    await incrementIaMessageCount(accountId, 2); // user + assistant = 2

    res.json({ userMessage, assistantMessage });
  } catch (error) {
    console.error('Error al enviar mensaje al asistente:', error);
    res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
};

// Streaming version
export const streamAssistantMessage = async (req: Request, res: Response) => {
  try {
    const { accountId, chatId, content, fileContext } = req.body;
    if (!accountId || typeof accountId !== 'string') return res.status(400).json({ error: 'accountId es requerido' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const streamLimitCheck = await checkIaMessageLimit(accountId);
    if (!streamLimitCheck.allowed) {
      return res.status(429).json({ error: 'Has alcanzado el límite diario de 50 mensajes en el plan Sin Cargo. Suscríbete a un plan de pago para continuar.' });
    }

    if (!content || typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'content es requerido' });

    const user = (req as any).user;
    let accountChat = chatId
      ? await AssistantChat.findOne({ _id: chatId, accountId, createdBy: user?.userId || '' })
      : await AssistantChat.findOne({ accountId, createdBy: user?.userId || '' });

    if (!accountChat) {
      accountChat = new AssistantChat({
        _id: chatId || Date.now().toString() + Math.random().toString(36).substr(2, 9),
        accountId,
        createdBy: user?.userId || '',
        name: 'Chat General',
        createdAt: new Date().toISOString(),
        messages: []
      });
    }

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: content.trim() };
    accountChat.messages.push(userMessage);
    // Save user message immediately
    accountChat.markModified('messages');
    await accountChat.save();

    const selectedSpecialties = await getAccountSpecialties(accountId);
    const accountCountry = await getAccountCountry(accountId);
    let legalCountryPrompt = '';
    if (hasLegalIntent(content.trim(), selectedSpecialties)) {
      const legalContext = await getLegalContextForAccount(accountId, content.trim(), selectedSpecialties, 5000, 'assistant');
      legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
    }

    const rawAssistMsgs = accountChat.messages.map((m) => ({ role: m.role, content: m.content }));
    const { contextMessages: assistStreamCtx, newSummary: assistStreamSummary } = await buildContextMessages(rawAssistMsgs, accountChat.summary);
    if (assistStreamSummary !== null) { accountChat.summary = assistStreamSummary; }

    // RAG: Search improve AI files if ragEnabled
    let ragContext: string | undefined;
    let ragFound = false;
    if (req.body.ragEnabled) {
      const { searchImproveAIContext } = await import('../services/ragService.js');
      const ragResult = await searchImproveAIContext(accountId, rawAssistMsgs);
      if (ragResult.found) {
        ragContext = ragResult.context;
        ragFound = true;
      }
    }

    const fullText = await streamAssistantAI(res, assistStreamCtx, selectedSpecialties, legalCountryPrompt || undefined, accountCountry, fileContext || undefined, ragContext, ragFound);

    // Save assistant message after stream completes
    const assistantContent = ragFound ? `${fullText}\n<!-- rag-enhanced -->` : fullText;
    const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: assistantContent };
    accountChat.messages.push(assistantMessage);
    await accountChat.save();

    await incrementIaMessageCount(accountId, 2);
  } catch (error) {
    console.error('Error streaming asistente:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
};

// Eliminar un chat específico
export const deleteAssistantChat = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { accountId } = req.query;

    if (!chatId || !accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'chatId y accountId son requeridos' });
    }
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const user = (req as any).user;
    const result = await AssistantChat.deleteOne({ _id: chatId, accountId, createdBy: user?.userId || '' });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar chat de asistente:', error);
    res.status(500).json({ error: 'Error al eliminar chat de asistente' });
  }
};

// Renombrar un chat específico
export const renameAssistantChat = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { accountId, name } = req.body;

    if (!chatId || !accountId || !name) {
      return res.status(400).json({ error: 'chatId, accountId y name son requeridos' });
    }
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const user = (req as any).user;
    const result = await AssistantChat.updateOne(
      { _id: chatId, accountId, createdBy: user?.userId || '' },
      { $set: { name: name.trim() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error al renombrar chat de asistente:', error);
    res.status(500).json({ error: 'Error al renombrar chat de asistente' });
  }
};

// Mantener compatibilidad con función antigua
export const clearAssistantChat = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const user = (req as any).user;
    await AssistantChat.deleteMany({ accountId, createdBy: user?.userId || '' });

    res.json({ success: true });
  } catch (error) {
    console.error('Error al limpiar chat de asistente:', error);
    res.status(500).json({ error: 'Error al limpiar chat de asistente' });
  }
};

export const getDailyIaUsage = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const today = new Date().toISOString().slice(0, 10);
    const usage = await DailyIaUsage.findOne({ accountId, date: today }).lean();
    const subscription = await Subscription.findOne({ accountId }).lean();
    const isFree = subscription?.plan === 'free';

    res.json({
      count: usage?.count || 0,
      limit: isFree ? 50 : null,
      isFree,
    });
  } catch (error) {
    console.error('Error getting daily IA usage:', error);
    res.status(500).json({ error: 'Error al obtener uso diario de IA' });
  }
};
