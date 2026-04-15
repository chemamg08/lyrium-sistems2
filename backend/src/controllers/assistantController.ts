import { Request, Response } from 'express';
import fs from 'fs/promises';
import { callAssistantAI, streamAssistantAI, buildContextMessages } from '../services/aiService.js';
import { getAccountSpecialties } from '../services/specialtiesService.js';
import { getLegalContextForAccount, buildCountryLegalSystemPrompt, getAccountCountry } from '../services/legalKnowledgeService.js';
import { hasLegalIntent } from '../services/legalIntentService.js';
import { AssistantChat } from '../models/AssistantChat.js';
import { verifyOwnership } from '../middleware/auth.js';

// ── Subir archivo y extraer texto ──────────────────────────────────────────
export const uploadAssistantFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const { path: filePath, originalname, mimetype } = req.file;
    let text = '';

    if (mimetype === 'application/pdf') {
      const pdfBuffer = await fs.readFile(filePath);
      const pdfParseModule: any = await import('pdf-parse');
      const PDFParse = pdfParseModule.PDFParse;
      const parser = new PDFParse({ data: pdfBuffer });
      const result = await parser.getText();
      text = result.text || '';
    } else {
      text = await fs.readFile(filePath, 'utf-8');
    }

    // Eliminar archivo temporal
    await fs.unlink(filePath).catch(() => {});

    // Limitar tamaño de contexto
    const MAX_CHARS = 25000;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + '\n\n[... documento truncado por longitud ...]';
    }

    res.json({ fileName: originalname, text, textLength: text.length });
  } catch (error) {
    console.error('Error procesando archivo del asistente:', error);
    res.status(500).json({ error: 'No se pudo procesar el archivo' });
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
    if (user?.type === 'subaccount') {
      listFilter.createdBy = user.userId;
    }

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
      const getFilter: any = { _id: chatId, accountId };
      if (user?.type === 'subaccount') {
        getFilter.createdBy = user.userId;
      }
      chat = await AssistantChat.findOne(getFilter);
    } else {
      // Retrocompatibilidad: devolver el primer chat de la cuenta
      const getFilter: any = { accountId };
      if (user?.type === 'subaccount') {
        getFilter.createdBy = user.userId;
      }
      chat = await AssistantChat.findOne(getFilter);
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

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content es requerido' });
    }

    let accountChat;
    if (chatId && typeof chatId === 'string') {
      accountChat = await AssistantChat.findOne({ _id: chatId, accountId });
    } else {
      // Retrocompatibilidad: usar el primer chat de la cuenta
      accountChat = await AssistantChat.findOne({ accountId });
    }

    if (!accountChat) {
      // Crear un nuevo chat si no existe
      accountChat = new AssistantChat({
        _id: chatId || Date.now().toString() + Math.random().toString(36).substr(2, 9),
        accountId,
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
    if (!content || typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'content es requerido' });

    let accountChat = chatId
      ? await AssistantChat.findOne({ _id: chatId, accountId })
      : await AssistantChat.findOne({ accountId });

    if (!accountChat) {
      accountChat = new AssistantChat({
        _id: chatId || Date.now().toString() + Math.random().toString(36).substr(2, 9),
        accountId,
        name: 'Chat General',
        createdAt: new Date().toISOString(),
        messages: []
      });
    }

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: content.trim() };
    accountChat.messages.push(userMessage);
    // Save user message immediately
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

    const result = await AssistantChat.deleteOne({ _id: chatId, accountId });

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

    const result = await AssistantChat.updateOne(
      { _id: chatId, accountId },
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

    await AssistantChat.deleteMany({ accountId });

    res.json({ success: true });
  } catch (error) {
    console.error('Error al limpiar chat de asistente:', error);
    res.status(500).json({ error: 'Error al limpiar chat de asistente' });
  }
};
