import { Request, Response } from 'express';
import { callClientAI, streamClientAI, buildContextMessages } from '../services/aiService.js';
import { getAccountSpecialties, filterContextBySpecialties } from '../services/specialtiesService.js';
import { getLegalContextForAccount, buildCountryLegalSystemPrompt, getAccountCountry } from '../services/legalKnowledgeService.js';
import { hasLegalIntent } from '../services/legalIntentService.js';
import { Chat } from '../models/Chat.js';
import { Client } from '../models/Client.js';
import { verifyOwnership } from '../middleware/auth.js';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// GET /api/chats?clientId=xxx - Obtener chats de un cliente
export const getClientChats = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId es requerido' });
    }

    const ownerClient = await Client.findById(clientId as string);
    if (!ownerClient) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!verifyOwnership(req, ownerClient.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const filter: any = { clientId: clientId as string };
    const user = (req as any).user;
    if (user?.type === 'subaccount') {
      filter.createdBy = user.userId;
    }

    const chats = await Chat.find(filter);
    res.json(chats.map(c => c.toJSON()));
  } catch (error) {
    console.error('Error al obtener chats:', error);
    res.status(500).json({ error: 'Error al obtener chats' });
  }
};

// POST /api/chats - Crear nuevo chat para un cliente
export const createClientChat = async (req: Request, res: Response) => {
  try {
    const { clientId, title } = req.body;

    if (!clientId || !title) {
      return res.status(400).json({ error: 'clientId y title son requeridos' });
    }

    const ownerClient = await Client.findById(clientId);
    if (!ownerClient) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!verifyOwnership(req, ownerClient.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const user = (req as any).user;
    const newChat = await Chat.create({
      _id: Date.now().toString(),
      clientId,
      title,
      date: new Date().toISOString().split('T')[0],
      source: 'client',
      createdBy: user?.userId || '',
      messages: []
    });

    res.status(201).json(newChat.toJSON());
  } catch (error) {
    console.error('Error al crear chat:', error);
    res.status(500).json({ error: 'Error al crear chat' });
  }
};

// POST /api/chats/message - Enviar mensaje en un chat de cliente
export const sendClientMessage = async (req: Request, res: Response) => {
  try {
    const { clientId, chatId, content } = req.body;

    if (!clientId || !chatId || !content || !content.trim()) {
      return res.status(400).json({ error: 'clientId, chatId y content son requeridos' });
    }

    const ownerClient = await Client.findById(clientId);
    if (!ownerClient) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!verifyOwnership(req, ownerClient.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const chat = await Chat.findOne({ _id: chatId, clientId });

    if (!chat) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    // Crear mensaje del usuario
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim()
    };

    chat.messages.push(userMessage);

    // Obtener contexto de documentos del cliente
    let documentsContext = '';
    let accountIdForSpecialties: string | null = null;
    try {
      const client = await Client.findById(clientId);
      if (client?.accountId) {
        accountIdForSpecialties = client.accountId;
      }
      
      if (client && client.files && client.files.length > 0) {
        const pdfTexts = client.files
          .filter((file: any) => file.extractedText)
          .map((file: any) => `--- ${file.name} ---\n${file.extractedText}`)
          .join('\n\n');
        
        if (pdfTexts) {
          documentsContext = pdfTexts;
        }
      }
    } catch (error) {
      console.error('Error al obtener documentos del cliente:', error);
    }

    // Preparar mensajes para IA (con token-budget)
    const { contextMessages, newSummary } = await buildContextMessages(chat.messages as any, chat.summary);
    if (newSummary !== null) { chat.summary = newSummary; }

    const selectedSpecialties = accountIdForSpecialties
      ? await getAccountSpecialties(accountIdForSpecialties)
      : [];

    const filteredDocumentsContext = filterContextBySpecialties(
      documentsContext,
      selectedSpecialties,
      content.trim(),
      12000
    );

    let legalCountryPrompt = '';
    let accountCountry = 'ES';
    if (accountIdForSpecialties) {
      accountCountry = await getAccountCountry(accountIdForSpecialties);
      if (hasLegalIntent(content.trim(), selectedSpecialties)) {
        const legalContext = await getLegalContextForAccount(
          accountIdForSpecialties,
          content.trim(),
          selectedSpecialties,
          5000,
          'lyri'
        );
        legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
      }
    }

    // Llamar a IA con contexto de documentos
    const aiResponse = await callClientAI(
      contextMessages,
      filteredDocumentsContext || undefined,
      selectedSpecialties,
      legalCountryPrompt || undefined,
      accountCountry
    );

    // Crear mensaje de respuesta
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: aiResponse
    };

    chat.messages.push(assistantMessage);
    await chat.save();

    res.json({ userMessage, assistantMessage });
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
};

// POST /api/chats/message/stream - Streaming version
export const streamClientMessage = async (req: Request, res: Response) => {
  try {
    const { clientId, chatId, content } = req.body;
    if (!clientId || !chatId || !content || !content.trim()) {
      return res.status(400).json({ error: 'clientId, chatId y content son requeridos' });
    }

    const ownerClient = await Client.findById(clientId);
    if (!ownerClient) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!verifyOwnership(req, ownerClient.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const chat = await Chat.findOne({ _id: chatId, clientId });
    if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: content.trim() };
    chat.messages.push(userMessage);
    await chat.save();

    let documentsContext = '';
    let accountIdForSpecialties: string | null = null;
    try {
      const cl = await Client.findById(clientId);
      if (cl?.accountId) accountIdForSpecialties = cl.accountId;
      if (cl?.files && cl.files.length > 0) {
        const pdfTexts = cl.files.filter((f: any) => f.extractedText).map((f: any) => `--- ${f.name} ---\n${f.extractedText}`).join('\n\n');
        if (pdfTexts) documentsContext = pdfTexts;
      }
    } catch (e) { /* ignore */ }

    const { contextMessages: streamCtx, newSummary: streamSummary } = await buildContextMessages(chat.messages as any, chat.summary);
    if (streamSummary !== null) { chat.summary = streamSummary; }
    const selectedSpecialties = accountIdForSpecialties ? await getAccountSpecialties(accountIdForSpecialties) : [];
    const filteredDocumentsContext = filterContextBySpecialties(documentsContext, selectedSpecialties, content.trim(), 12000);
    let legalCountryPrompt = '';
    let accountCountry = 'ES';
    if (accountIdForSpecialties) {
      accountCountry = await getAccountCountry(accountIdForSpecialties);
      if (hasLegalIntent(content.trim(), selectedSpecialties)) {
        const legalContext = await getLegalContextForAccount(accountIdForSpecialties, content.trim(), selectedSpecialties, 5000, 'lyri');
        legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
      }
    }

    const fullText = await streamClientAI(res, streamCtx, filteredDocumentsContext || undefined, selectedSpecialties, legalCountryPrompt || undefined, accountCountry);

    const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: fullText };
    chat.messages.push(assistantMessage);
    await chat.save();
  } catch (error) {
    console.error('Error streaming cliente:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
};

// DELETE /api/chats/:id - Eliminar un chat
export const deleteClientChat = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const chatToDelete = await Chat.findById(id);
    if (!chatToDelete) return res.status(404).json({ error: 'Chat no encontrado' });
    const chatClient = await Client.findById(chatToDelete.clientId);
    if (!chatClient || !verifyOwnership(req, chatClient.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const user = (req as any).user;
    const filter: any = { _id: id };
    if (user?.type === 'subaccount') {
      filter.createdBy = user.userId;
    }

    const result = await Chat.findOneAndDelete(filter);

    if (!result) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    res.json({ message: 'Chat eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar chat:', error);
    res.status(500).json({ error: 'Error al eliminar chat' });
  }
};

// DELETE /api/chats/empty/:clientId - Eliminar chats vacíos de un cliente
export const deleteEmptyChats = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId es requerido' });
    }

    const ownerClient = await Client.findById(clientId);
    if (!ownerClient) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!verifyOwnership(req, ownerClient.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const deleteFilter: any = { clientId, messages: { $size: 0 } };
    const user = (req as any).user;
    if (user?.type === 'subaccount') {
      deleteFilter.createdBy = user.userId;
    }
    const result = await Chat.deleteMany(deleteFilter);

    res.json({ message: `${result.deletedCount} chats vacíos eliminados`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error al eliminar chats vacíos:', error);
    res.status(500).json({ error: 'Error al eliminar chats vacíos' });
  }
};
