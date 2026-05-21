import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { callDefenseAI, extractDefenseStrategy, streamDefenseAI, getAiClient, AI_MODEL, buildContextMessages, stripThinkTags } from '../services/aiService.js';
import { generateDefensePDF } from '../services/pdfService.js';
import { getAccountSpecialties } from '../services/specialtiesService.js';
import { getLegalContextForAccount, buildCountryLegalSystemPrompt, getAccountCountry } from '../services/legalKnowledgeService.js';
import { hasLegalIntent } from '../services/legalIntentService.js';
import { DefenseChat } from '../models/DefenseChat.js';
import { DefenseEvidence } from '../models/DefenseEvidence.js';
import { Chat } from '../models/Chat.js';
import { Client } from '../models/Client.js';
import { Stat } from '../models/Stat.js';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';
import { verifyOwnership } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads/clients');

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface CounterReplica {
  opponentArguments: string[];
  rebuttals: string[];
  strengthScore: number;
}

interface SavedStrategy {
  id: string;
  title: string;
  content?: string;
  date: string;
  sections: {
    lineasDefensa: string[];
    argumentosJuridicos: string[];
    jurisprudencia: string[];
    puntosDebiles: string[];
    contraArgumentos: string[];
    recomendaciones: string[];
  };
  counterReplica?: CounterReplica;
}

// GET /api/defense-chat/chats - Listar todos los chats de defensa de una cuenta
export const getDefenseChats = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    
    const filter: any = { accountId: accountId as string };
    const user = (req as any).user;
    filter.createdBy = user?.userId || '';
    
    const chats = await DefenseChat.find(filter)
      .sort({ lastModified: -1 });

    const accountChats = chats.map(c => ({
      id: c._id,
      title: c.title,
      createdAt: c.createdAt,
      lastModified: c.lastModified,
      messageCount: c.messages.length,
      strategiesCount: c.savedStrategies?.length || 0,
      firstMessagePreview: c.messages[0]?.content?.substring(0, 80) || ''
    }));

    res.json({ chats: accountChats });
  } catch (error) {
    console.error('Error al obtener lista de chats de defensa:', error);
    res.status(500).json({ error: 'Error al obtener lista de chats de defensa' });
  }
};

// POST /api/defense-chat/chats - Crear nuevo chat de defensa
export const createDefenseChat = async (req: Request, res: Response) => {
  try {
    const { accountId, title } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });

    const accountChatsCount = await DefenseChat.countDocuments({ accountId: accountId as string });
    
    const user = (req as any).user;
    const newChat = await DefenseChat.create({
      _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      accountId: accountId as string,
      createdBy: user?.userId || '',
      title: title || `Defensa ${accountChatsCount + 1}`,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      messages: [],
      savedStrategies: [],
      latestCounterReplica: null,
      awaitingStrategyConfirmation: false
    });

    res.json({ 
      id: newChat._id, 
      title: newChat.title, 
      createdAt: newChat.createdAt 
    });
  } catch (error) {
    console.error('Error al crear chat de defensa:', error);
    res.status(500).json({ error: 'Error al crear chat de defensa' });
  }
};

// DELETE /api/defense-chat/chats/:chatId - Eliminar un chat específico
export const deleteDefenseChatById = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { accountId } = req.query;

    if (!chatId || !accountId) {
      return res.status(400).json({ error: 'chatId y accountId son requeridos' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });

    const deleteFilter: any = { _id: chatId, accountId: accountId as string };
    const user = (req as any).user;
    deleteFilter.createdBy = user?.userId || '';

    const result = await DefenseChat.findOneAndDelete(deleteFilter);
    
    if (!result) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar chat de defensa:', error);
    res.status(500).json({ error: 'Error al eliminar chat de defensa' });
  }
};

// PUT /api/defense-chat/chats/:chatId - Actualizar título de chat
export const updateDefenseChatTitle = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { accountId, title } = req.body;

    if (!chatId || !accountId || !title) {
      return res.status(400).json({ error: 'chatId, accountId y title son requeridos' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;

    const chat = await DefenseChat.findOneAndUpdate(
      { _id: chatId, accountId, createdBy: user?.userId || '' },
      { title, lastModified: new Date().toISOString() },
      { returnDocument: 'after' }
    );
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    res.json({ success: true, title: chat.title });
  } catch (error) {
    console.error('Error al actualizar título del chat:', error);
    res.status(500).json({ error: 'Error al actualizar título del chat' });
  }
};

// GET /api/defense-chat - Obtener mensajes del chat de defensa
export const getDefenseChat = async (req: Request, res: Response) => {
  try {
    const { accountId, chatId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    
    let chat;
    const user = (req as any).user;
    
    if (chatId && typeof chatId === 'string') {
      const getFilter: any = { accountId: accountId as string, _id: chatId, createdBy: user?.userId || '' };
      chat = await DefenseChat.findOne(getFilter);
    } else {
      // Retrocompatibilidad: devolver el primer/más reciente chat de la cuenta
      const getFilter: any = { accountId: accountId as string, createdBy: user?.userId || '' };
      chat = await DefenseChat.findOne(getFilter)
        .sort({ lastModified: -1 });
    }
    
    if (!chat) {
      return res.json({ id: null, messages: [], savedStrategies: [], latestCounterReplica: null });
    }
    
    res.json({ 
      id: chat._id,
      title: chat.title,
      messages: chat.messages,
      savedStrategies: chat.savedStrategies || [],
      latestCounterReplica: (chat as any).latestCounterReplica || null
    });
  } catch (error) {
    console.error('Error al obtener chat de defensa:', error);
    res.status(500).json({ error: 'Error al obtener chat de defensa' });
  }
};

// POST /api/defense-chat/message - Enviar mensaje y obtener respuesta de IA
export const sendDefenseMessage = async (req: Request, res: Response) => {
  try {
    const { content, accountId, chatId } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'El contenido del mensaje es requerido' });
    }
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;

    let chat;
    
    if (chatId && typeof chatId === 'string') {
      chat = await DefenseChat.findOne({ accountId, _id: chatId, createdBy: user?.userId || '' });
    } else {
      // Retrocompatibilidad: buscar el primer chat de la cuenta
      chat = await DefenseChat.findOne({ accountId, createdBy: user?.userId || '' });
    }
    
    if (!chat) {
      // Crear un nuevo chat si no existe
      chat = new DefenseChat({
        _id: chatId || Date.now().toString() + Math.random().toString(36).substr(2, 9),
        accountId,
        createdBy: user?.userId || '',
        title: 'Defensa General',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        messages: [],
        savedStrategies: [],
        latestCounterReplica: null,
        awaitingStrategyConfirmation: false
      });
    }

    // Inicializar campos si no existen
    if (!chat.savedStrategies) {
      chat.savedStrategies = [];
    }
    if (chat.awaitingStrategyConfirmation === undefined) {
      chat.awaitingStrategyConfirmation = false;
    }

    // Detectar si el usuario está confirmando guardar estrategia
    const confirmationKeywords = ['sí', 'si', 'guarda', 'guardar', 'guárdalo', 'guardalo', 'ok', 'vale', 'adelante', 'procede'];
    const userContentLower = content.trim().toLowerCase();
    const isConfirming = chat.awaitingStrategyConfirmation && 
                         confirmationKeywords.some(kw => userContentLower.includes(kw));

    if (isConfirming) {
      // El usuario confirmó guardar estrategia
      try {
        const extraction = await extractDefenseStrategy(chat.messages);

        // Validar que la extracción tiene contenido real
        const hasContent = extraction.lineasDefensa.length > 0 ||
          extraction.argumentosJuridicos.length > 0 ||
          extraction.jurisprudencia.length > 0 ||
          extraction.recomendaciones.length > 0;

        if (!hasContent) {
          // No hay contenido suficiente para guardar
          const userMessage: Message = { id: Date.now().toString(), role: 'user', content: content.trim() };
          chat.messages.push(userMessage);
          const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: 'No he podido extraer una estrategia estructurada de la conversación. Continúa desarrollándola y cuando esté más completa, pruébalo de nuevo.' };
          chat.messages.push(assistantMessage);
          chat.awaitingStrategyConfirmation = false;
          chat.lastModified = new Date().toISOString();
          await chat.save();
          return res.json({ userMessage, assistantMessage, strategySaved: false });
        }
        
        const newStrategy: SavedStrategy = {
          id: Date.now().toString(),
          title: extraction.title,
          date: new Date().toISOString(),
          sections: {
            lineasDefensa: extraction.lineasDefensa,
            argumentosJuridicos: extraction.argumentosJuridicos,
            jurisprudencia: extraction.jurisprudencia,
            puntosDebiles: extraction.puntosDebiles,
            contraArgumentos: extraction.contraArgumentos,
            recomendaciones: extraction.recomendaciones
          },
          counterReplica: (chat as any).latestCounterReplica || undefined
        };

        chat.savedStrategies = [newStrategy as any];
        chat.awaitingStrategyConfirmation = false;
        chat.lastModified = new Date().toISOString();

        // Crear mensaje del usuario
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: content.trim()
        };
        chat.messages.push(userMessage);

        // Respuesta confirmando guardado
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `✓ Perfecto, he guardado la estrategia "${extraction.title}". Ahora cuando exportes el PDF, incluirá toda esta información estructurada. ¿Hay algo más en lo que pueda ayudarte con esta defensa?`
        };
        chat.messages.push(assistantMessage);

        chat.markModified('messages');
        await chat.save();

        return res.json({ 
          userMessage, 
          assistantMessage,
          strategySaved: true,
          strategy: newStrategy
        });
      } catch (error) {
        console.error('Error al extraer estrategia:', error);
        // Continuar con flujo normal si falla la extracción
      }
    }

    // Crear mensaje del usuario
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim()
    };

    chat.messages.push(userMessage);
    chat.lastModified = new Date().toISOString();

    // Preparar mensajes para IA (con token-budget)
    const { contextMessages, newSummary } = await buildContextMessages(chat.messages as any, chat.summary);
    if (newSummary !== null) { chat.summary = newSummary; }

    const selectedSpecialties = await getAccountSpecialties(accountId);
    const accountCountry = await getAccountCountry(accountId);
    let legalCountryPrompt = '';
    if (hasLegalIntent(content.trim(), selectedSpecialties)) {
      const legalContext = await getLegalContextForAccount(accountId, content.trim(), selectedSpecialties, 5000, 'defense');
      legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
    }

    // Llamar a IA
    const aiResponse = await callDefenseAI(contextMessages, selectedSpecialties, legalCountryPrompt || undefined, accountCountry);

    // Detectar si la IA está preguntando por guardar/actualizar estrategia
    const aiTextLower2 = aiResponse.toLowerCase();
    const aiAsksToSave = aiTextLower2.includes('quieres que guarde') ||
                         aiTextLower2.includes('quieres que actualice') ||
                         aiTextLower2.includes('guardar la estrategia') ||
                         aiTextLower2.includes('guarde la estrategia') ||
                         aiTextLower2.includes('actualizar la estrategia');
    
    if (aiAsksToSave) {
      chat.awaitingStrategyConfirmation = true;
    }

    // Crear mensaje de respuesta
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: aiResponse
    };

    chat.messages.push(assistantMessage);

    // Guardar
    await chat.save();

    res.json({ 
      userMessage, 
      assistantMessage,
      chatId: chat._id,
      awaitingConfirmation: chat.awaitingStrategyConfirmation
    });
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
};

// Detecta mediante IA si el usuario quiere guardar la estrategia
async function wantsSaveStrategy(userMessage: string): Promise<boolean> {
  try {
    const response = await getAiClient().chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Eres un clasificador de intenciones. Responde ÚNICAMENTE con "sí" o "no", sin explicación.'
        },
        {
          role: 'user',
          content: `¿El siguiente mensaje expresa la intención de guardar, almacenar o extraer una estrategia de defensa legal?\n\nMensaje: "${userMessage}"` 
        }
      ],
      max_tokens: 5,
      temperature: 0
    });
    const answer = stripThinkTags(response.choices[0].message.content || '').toLowerCase().trim();
    return answer.startsWith('s');
  } catch {
    return false;
  }
}

// POST /api/defense-chat/message/stream
export const streamDefenseMessage = async (req: Request, res: Response) => {
  try {
    const { content, accountId, chatId } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'El contenido es requerido' });
    if (!accountId) return res.status(400).json({ error: 'accountId es requerido' });
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;

    let chat = chatId
      ? await DefenseChat.findOne({ accountId, _id: chatId, createdBy: user?.userId || '' })
      : await DefenseChat.findOne({ accountId, createdBy: user?.userId || '' });

    if (!chat) {
      chat = new DefenseChat({
        _id: chatId || Date.now().toString() + Math.random().toString(36).substr(2, 9),
        accountId,
        createdBy: user?.userId || '',
        title: 'Defensa General',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        messages: [],
        savedStrategies: [],
        latestCounterReplica: null,
        awaitingStrategyConfirmation: false
      });
    }
    if (!chat.savedStrategies) chat.savedStrategies = [];
    if (chat.awaitingStrategyConfirmation === undefined) chat.awaitingStrategyConfirmation = false;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: content.trim() };
    chat.messages.push(userMessage);
    chat.lastModified = new Date().toISOString();
    await chat.save();

    // Detectar confirmación de guardar estrategia (keywords + flag)
    const confirmationKeywords = ['sí', 'si', 'guarda', 'guardar', 'guárdalo', 'guardalo', 'ok', 'vale', 'adelante', 'procede', 'actualiza', 'actualízala'];
    const userContentLower = content.trim().toLowerCase();
    const isConfirmingByKeyword = chat.awaitingStrategyConfirmation && 
                                  confirmationKeywords.some(kw => userContentLower.includes(kw));

    // También detectar intención explícita con IA
    const hasAssistantMessages = chat.messages.filter(m => m.role === 'assistant').length > 0;
    const wantsSave = isConfirmingByKeyword || (hasAssistantMessages && await wantsSaveStrategy(content.trim()));

    if (wantsSave) {
      // Iniciar SSE inmediatamente para que el frontend muestre spinner
      let clientDisconnected = false;
      res.on('close', () => { clientDisconnected = true; });
      const safeWrite = (data: string) => {
        if (!clientDisconnected) { try { res.write(data); } catch { clientDisconnected = true; } }
      };
      const safeEnd = () => {
        if (!clientDisconnected) { try { res.end(); } catch { /* already closed */ } }
      };

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      safeWrite(`data: ${JSON.stringify({ saving: true })}\n\n`);

      try {
        const extraction = await extractDefenseStrategy(chat.messages);

        // Validar que la extracción tiene contenido real
        const hasContent = extraction.lineasDefensa.length > 0 ||
          extraction.argumentosJuridicos.length > 0 ||
          extraction.jurisprudencia.length > 0 ||
          extraction.recomendaciones.length > 0;

        if (!hasContent) {
          // Enviar mensaje informativo y continuar con flujo normal
          const infoMsg = 'No he podido extraer una estrategia estructurada aún. Continúa desarrollándola y pruébalo de nuevo.';
          const words = infoMsg.split(' ');
          for (const word of words) {
            safeWrite(`data: ${JSON.stringify({ token: word + ' ' })}\n\n`);
          }
          chat.awaitingStrategyConfirmation = false;
          const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: infoMsg };
          chat.messages.push(assistantMsg);
          await chat.save();
          safeWrite(`data: ${JSON.stringify({ done: true })}\n\n`);
          safeEnd();
          return;
        }

        const newStrategy: SavedStrategy = {
          id: Date.now().toString(),
          title: extraction.title,
          date: new Date().toISOString(),
          sections: {
            lineasDefensa: extraction.lineasDefensa,
            argumentosJuridicos: extraction.argumentosJuridicos,
            jurisprudencia: extraction.jurisprudencia,
            puntosDebiles: extraction.puntosDebiles,
            contraArgumentos: extraction.contraArgumentos,
            recomendaciones: extraction.recomendaciones
          },
          counterReplica: (chat as any).latestCounterReplica || undefined
        };
        chat.savedStrategies = [newStrategy as any];
        chat.awaitingStrategyConfirmation = false;
        const confirmMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `✅ Estrategia guardada correctamente: **"${extraction.title}"**\n\nYa puedes pulsar **Export to Client** para descargar el PDF y asociarla a un cliente.`
        };
        chat.messages.push(confirmMsg);
        await chat.save();

        // Incrementar contador de defensas creadas
        try {
          await Stat.findByIdAndUpdate(accountId, { $inc: { defensesCreated: 1 } }, { upsert: true });
        } catch (e) { console.error('Error al actualizar estadísticas:', e); }
        // Enviar tokens SSE (headers ya establecidos arriba)
        const words = confirmMsg.content.split(' ');
        for (const word of words) {
          safeWrite(`data: ${JSON.stringify({ token: word + ' ' })}\n\n`);
        }
        safeWrite(`data: ${JSON.stringify({ done: true })}\n\n`);
        safeEnd();
        return;
      } catch (extractError) {
        console.error('Error extrayendo estrategia:', extractError);
        // Si falla la extracción, continuar con flujo normal
      }
    }

    const rawDefMsgs = chat.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const { contextMessages: defStreamCtx, newSummary: defStreamSummary } = await buildContextMessages(rawDefMsgs, chat.summary);
    if (defStreamSummary !== null) { chat.summary = defStreamSummary; }
    const selectedSpecialties = await getAccountSpecialties(accountId);
    const accountCountry = await getAccountCountry(accountId);
    let legalCountryPrompt = '';
    if (hasLegalIntent(content.trim(), selectedSpecialties)) {
      const legalContext = await getLegalContextForAccount(accountId, content.trim(), selectedSpecialties, 5000, 'defense');
      legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
    }

    // RAG: Search improve AI files if ragEnabled
    let ragContext: string | undefined;
    let ragFound = false;
    if (req.body.ragEnabled) {
      const { searchImproveAIContext } = await import('../services/ragService.js');
      const ragResult = await searchImproveAIContext(accountId, rawDefMsgs);
      if (ragResult.found) {
        ragContext = ragResult.context;
        ragFound = true;
      }
    }

    const fullText = await streamDefenseAI(res, defStreamCtx, selectedSpecialties, legalCountryPrompt || undefined, accountCountry, ragContext, ragFound);

    const defAssistantContent = ragFound ? `${fullText}\n<!-- rag-enhanced -->` : fullText;
    const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: defAssistantContent };
    chat.messages.push(assistantMessage);

    // Detectar si la IA está preguntando por guardar/actualizar estrategia
    const aiTextLower = fullText.toLowerCase();
    const aiAsksToSave = aiTextLower.includes('quieres que guarde') ||
                         aiTextLower.includes('quieres que actualice') ||
                         aiTextLower.includes('guardar la estrategia') ||
                         aiTextLower.includes('guarde la estrategia') ||
                         aiTextLower.includes('actualizar la estrategia');
    chat.awaitingStrategyConfirmation = aiAsksToSave;
    await chat.save();
  } catch (error) {
    console.error('Error streaming defensa:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
};

// POST /api/defense-chat/export - Exportar chat a cliente y generar PDF
export const exportDefenseChat = async (req: Request, res: Response) => {
  try {
    const { clientId, chatTitle, accountId, chatId } = req.body;

    if (!clientId || !chatTitle) {
      return res.status(400).json({ error: 'clientId y chatTitle son requeridos' });
    }
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;

    let defenseChat;
    
    if (chatId) {
      defenseChat = await DefenseChat.findOne({ accountId, _id: chatId, createdBy: user?.userId || '' });
    } else {
      // Retrocompatibilidad: usar el primer chat
      defenseChat = await DefenseChat.findOne({ accountId, createdBy: user?.userId || '' });
    }

    if (!defenseChat || !defenseChat.savedStrategies || defenseChat.savedStrategies.length === 0) {
      return res.status(400).json({ error: 'No hay estrategias guardadas para exportar' });
    }

    const client = await Client.findOne({ _id: clientId, accountId });
    if (!client) {
      return res.status(403).json({ error: 'Cliente no válido para esta cuenta' });
    }

    // Crear nuevo chat en la colección de chats de clientes
    await Chat.create({
      _id: Date.now().toString(),
      clientId,
      title: chatTitle,
      date: new Date().toISOString().split('T')[0],
      source: 'defense',
      messages: [...defenseChat.messages]
    });

    // Generar PDF con estrategias guardadas
    const publicBaseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const evidences = await DefenseEvidence.find({ chatId: defenseChat._id, isDeleted: false });
    const pdfStream = generateDefensePDF(defenseChat.savedStrategies as any[], chatTitle, evidences.map(e => ({ fileName: e.fileName, publicToken: e.publicToken })), publicBaseUrl);

    // Guardar PDF también en archivos del cliente
    const fileId = Date.now().toString();
    const safeFileName = chatTitle.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '').trim();
    const pdfFileName = `${fileId}_${safeFileName}.pdf`;
    const clientDir = path.join(UPLOADS_DIR, clientId);
    
    // Asegurar que existe el directorio del cliente
    await fs.mkdir(clientDir, { recursive: true });
    
    const pdfFilePath = path.join(clientDir, pdfFileName);
    
    // Crear un stream para guardar el archivo
    const { createWriteStream } = await import('fs');
    const fileWriteStream = createWriteStream(pdfFilePath);
    
    // Generar otro PDF para guardarlo (pdfStream solo se puede consumir una vez)
    const pdfStreamForFile = generateDefensePDF(defenseChat.savedStrategies as any[], chatTitle);
    
    // Guardar en archivo de forma asíncrona
    await new Promise<void>((resolve, reject) => {
      pdfStreamForFile.pipe(fileWriteStream);
      fileWriteStream.on('finish', resolve);
      fileWriteStream.on('error', reject);
    });
    
    // Añadir archivo a la lista de archivos del cliente
    try {
      const client = await Client.findById(clientId);
      
      if (client) {
        if (!client.files) {
          client.files = [];
        }
        client.files.push({
          id: fileId,
          name: `${safeFileName}.pdf`,
          date: new Date().toISOString().split('T')[0],
          filePath: `uploads/clients/${clientId}/${pdfFileName}`
        });
        await client.save();
      }
    } catch (error) {
      console.error('Error al añadir archivo al cliente:', error);
      // No falla la exportación si hay error al guardar en cliente
    }

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(chatTitle)}.pdf"`);

    // Enviar PDF
    pdfStream.pipe(res);
  } catch (error) {
    console.error('Error al exportar chat:', error);
    res.status(500).json({ error: 'Error al exportar chat' });
  }
};

// POST /api/defense-chat/download-pdf - Descargar PDF de estrategias sin asociar a cliente
export const downloadDefensePDF = async (req: Request, res: Response) => {
  try {
    const { accountId, chatId, strategyId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;

    let defenseChat;
    if (chatId) {
      defenseChat = await DefenseChat.findOne({ accountId, _id: chatId, createdBy: user?.userId || '' });
    } else {
      defenseChat = await DefenseChat.findOne({ accountId, createdBy: user?.userId || '' });
    }

    if (!defenseChat || !defenseChat.savedStrategies || defenseChat.savedStrategies.length === 0) {
      return res.status(400).json({ error: 'No hay estrategias guardadas' });
    }

    // Si se pide una estrategia específica, filtrar
    let strategiesToExport = defenseChat.savedStrategies as any[];
    let pdfTitle = defenseChat.title || 'Estrategia de Defensa';
    
    if (strategyId) {
      const found = strategiesToExport.find((s: any) => s.id === strategyId);
      if (!found) {
        return res.status(404).json({ error: 'Estrategia no encontrada' });
      }
      strategiesToExport = [found];
      pdfTitle = found.title || pdfTitle;
    }

    const publicBaseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const evidences = await DefenseEvidence.find({ chatId: defenseChat._id, isDeleted: false });
    const pdfStream = generateDefensePDF(strategiesToExport, pdfTitle, evidences.map(e => ({ fileName: e.fileName, publicToken: e.publicToken })), publicBaseUrl);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(pdfTitle)}.pdf"`);
    pdfStream.pipe(res);
  } catch (error) {
    console.error('Error al descargar PDF de defensa:', error);
    res.status(500).json({ error: 'Error al descargar PDF' });
  }
};

// POST /api/defense-chat/import - Importar chat de cliente a defensa
export const importDefenseChat = async (req: Request, res: Response) => {
  try {
    const { chatId: sourceChatId, accountId, targetChatId } = req.body;

    if (!sourceChatId) {
      return res.status(400).json({ error: 'chatId es requerido' });
    }
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;

    const chatToImport = await Chat.findById(sourceChatId);

    if (!chatToImport) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }
    const sourceClient = await Client.findOne({ _id: chatToImport.clientId, accountId });
    if (!sourceClient) {
      return res.status(403).json({ error: 'Chat fuente no pertenece a esta cuenta' });
    }

    let defenseChat;
    
    if (targetChatId) {
      defenseChat = await DefenseChat.findOne({ accountId, _id: targetChatId, createdBy: user?.userId || '' });
    }
    
    if (!defenseChat) {
      defenseChat = new DefenseChat({
        _id: targetChatId || Date.now().toString() + Math.random().toString(36).substr(2, 9),
        accountId: accountId as string,
        createdBy: user?.userId || '',
        title: `Importado: ${chatToImport.title}`,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        messages: [...chatToImport.messages],
        savedStrategies: [],
        latestCounterReplica: null,
        awaitingStrategyConfirmation: false
      });
    } else {
      defenseChat.messages = [...chatToImport.messages] as any;
      defenseChat.savedStrategies = [];
      (defenseChat as any).latestCounterReplica = null;
      defenseChat.title = `Importado: ${chatToImport.title}`;
      defenseChat.lastModified = new Date().toISOString();
    }

    await defenseChat.save();

    res.json({ 
      chatId: defenseChat._id,
      messages: defenseChat.messages 
    });
  } catch (error) {
    console.error('Error al importar chat:', error);
    res.status(500).json({ error: 'Error al importar chat' });
  }
};

// GET /api/defense-chat/strategies - Obtener estrategias guardadas
export const getSavedStrategies = async (req: Request, res: Response) => {
  try {
    const { accountId, chatId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    
    if (chatId && typeof chatId === 'string') {
      const defenseChat = await DefenseChat.findOne({ accountId: accountId as string, _id: chatId, createdBy: user?.userId || '' });
      if (!defenseChat || !defenseChat.savedStrategies) {
        return res.json({ strategies: [] });
      }
      return res.json({ strategies: defenseChat.savedStrategies });
    }

    // Devolver estrategias de todos los chats de la cuenta
    const accountChats = await DefenseChat.find({ accountId: accountId as string, createdBy: user?.userId || '' });
    const allStrategies = accountChats.flatMap(c => c.savedStrategies || []);
    res.json({ strategies: allStrategies });
  } catch (error) {
    console.error('Error al obtener estrategias:', error);
    res.status(500).json({ error: 'Error al obtener estrategias' });
  }
};

// DELETE /api/defense-chat/strategies/:id - Eliminar una estrategia guardada
export const deleteStrategy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { accountId, chatId } = req.body;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    
    let defenseChat;
    
    if (chatId) {
      defenseChat = await DefenseChat.findOne({ accountId, _id: chatId, createdBy: user?.userId || '' });
    } else {
      // Buscar en todos los chats de la cuenta
      defenseChat = await DefenseChat.findOne({
        accountId,
        createdBy: user?.userId || '',
        'savedStrategies.id': id
      });
    }
    
    if (!defenseChat || !defenseChat.savedStrategies) {
      return res.status(404).json({ error: 'No se encontraron estrategias' });
    }
    
    defenseChat.savedStrategies = defenseChat.savedStrategies.filter((s: any) => s.id !== id);
    defenseChat.lastModified = new Date().toISOString();
    await defenseChat.save();
    
    res.json({ message: 'Estrategia eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar estrategia:', error);
    res.status(500).json({ error: 'Error al eliminar estrategia' });
  }
};

// POST /api/defense-chat/upload-pdf - Extraer texto de PDF subido al chat
export const uploadPdfToChat = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }
  const pdfPath = req.file.path;
  try {
    const pdfBuffer = await fs.readFile(pdfPath);
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: pdfBuffer });
    let extractedText = 'No se pudo extraer texto del PDF';
    try {
      const result = await parser.getText();
      extractedText = result.text || extractedText;
    } finally {
      await parser.destroy().catch(() => {});
    }
    extractedText = extractedText.substring(0, 15000);
    res.json({ filename: sanitizeFilename(req.file.originalname), text: extractedText });
  } catch (error) {
    console.error('Error extrayendo texto del PDF:', error);
    res.status(500).json({ error: 'Error al procesar el PDF' });
  } finally {
    await fs.unlink(pdfPath).catch(() => {});
  }
};

// DELETE /api/defense-chat - Limpiar chat de defensa
export const clearDefenseChat = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    
    await DefenseChat.deleteMany({ accountId, createdBy: user?.userId || '' });
    res.json({ message: 'Chat de defensa limpiado' });
  } catch (error) {
    console.error('Error al limpiar chat:', error);
    res.status(500).json({ error: 'Error al limpiar chat' });
  }
};

// GET /api/defense-chat/:chatId/evidence
export const getEvidence = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const chat = await DefenseChat.findOne({ _id: chatId, accountId: accountId as string, createdBy: user?.userId || '' });
    if (!chat || chat.accountId !== accountId) return res.status(403).json({ error: 'Acceso denegado' });
    const evidence = await DefenseEvidence.find({
      chatId,
      accountId: accountId as string,
      createdBy: user?.userId || '',
      isDeleted: false,
    }).sort({ exhibitNumber: 1 });
    res.json(evidence);
  } catch (error) {
    console.error('Error al obtener pruebas:', error);
    res.status(500).json({ error: 'Error al obtener pruebas' });
  }
};

// POST /api/defense-chat/:chatId/evidence
export const createEvidence = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { accountId, exhibitNumber, type, description, fileName, dateObtained, status } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const chat = await DefenseChat.findOne({ _id: chatId, accountId, createdBy: user?.userId || '' });
    if (!chat || chat.accountId !== accountId) return res.status(403).json({ error: 'Acceso denegado' });
    const evidence = await DefenseEvidence.create({
      _id: Date.now().toString(),
      chatId,
      accountId,
      createdBy: user?.userId || '',
      exhibitNumber: exhibitNumber || '',
      type: type || '',
      description: description || '',
      fileName: fileName || '',
      dateObtained: dateObtained || '',
      status: status || 'pending',
    });
    res.status(201).json(evidence.toJSON());
  } catch (error) {
    console.error('Error al crear prueba:', error);
    res.status(500).json({ error: 'Error al crear prueba' });
  }
};

// PUT /api/defense-chat/evidence/:evidenceId
export const updateEvidence = async (req: Request, res: Response) => {
  try {
    const { evidenceId } = req.params;
    const { accountId, exhibitNumber, type, description, fileName, dateObtained, status } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const evidence = await DefenseEvidence.findById(evidenceId);
    if (!evidence) return res.status(404).json({ error: 'Prueba no encontrada' });
    if (evidence.accountId !== accountId) return res.status(403).json({ error: 'Acceso denegado' });
    if (evidence.createdBy !== user?.userId) return res.status(403).json({ error: 'Acceso denegado' });
    if (exhibitNumber !== undefined) evidence.exhibitNumber = exhibitNumber;
    if (type !== undefined) evidence.type = type;
    if (description !== undefined) evidence.description = description;
    if (fileName !== undefined) evidence.fileName = fileName;
    if (dateObtained !== undefined) evidence.dateObtained = dateObtained;
    if (status !== undefined) evidence.status = status;
    await evidence.save();
    res.json(evidence.toJSON());
  } catch (error) {
    console.error('Error al actualizar prueba:', error);
    res.status(500).json({ error: 'Error al actualizar prueba' });
  }
};

// DELETE /api/defense-chat/evidence/:evidenceId
export const deleteEvidence = async (req: Request, res: Response) => {
  try {
    const { evidenceId } = req.params;
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const evidence = await DefenseEvidence.findById(evidenceId);
    if (!evidence) return res.status(404).json({ error: 'Prueba no encontrada' });
    if (evidence.accountId !== accountId) return res.status(403).json({ error: 'Acceso denegado' });
    if (evidence.createdBy !== user?.userId) return res.status(403).json({ error: 'Acceso denegado' });
    await DefenseEvidence.findByIdAndDelete(evidenceId);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar prueba:', error);
    res.status(500).json({ error: 'Error al eliminar prueba' });
  }
};

// POST /api/defense-chat/:chatId/simulate-counter-replica
export const simulateCounterReplica = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const chat = await DefenseChat.findOne({ _id: chatId, accountId, createdBy: user?.userId || '' });
    if (!chat || chat.accountId !== accountId) return res.status(403).json({ error: 'Acceso denegado' });

    const { simulateCounterReplicaAI } = await import('../services/aiService.js');
    const result = await simulateCounterReplicaAI(chat);

    (chat as any).latestCounterReplica = result;
    chat.lastModified = new Date().toISOString();
    chat.markModified('latestCounterReplica');
    await chat.save();

    res.json({ success: true, counterReplica: result });
  } catch (error: any) {
    console.error('Error al simular contrarréplica:', error);
    res.status(500).json({ error: error.message || 'Error al simular contrarréplica' });
  }
};

// POST /api/defense-chat/:chatId/save-counter-replica
export const saveCounterReplica = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { accountId, strategyId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const chat = await DefenseChat.findOne({ _id: chatId, accountId, createdBy: user?.userId || '' });
    if (!chat || chat.accountId !== accountId) return res.status(403).json({ error: 'Acceso denegado' });

    const latestCounterReplica = (chat as any).latestCounterReplica as CounterReplica | null | undefined;
    if (!latestCounterReplica) {
      return res.status(400).json({ error: 'No hay contrarréplica simulada para guardar' });
    }

    let strategy = strategyId
      ? chat.savedStrategies.find((s: any) => s.id === strategyId)
      : null;

    if (!strategy && chat.savedStrategies.length > 0) {
      strategy = chat.savedStrategies[chat.savedStrategies.length - 1];
    }

    if (!strategy) {
      return res.status(400).json({ error: 'No hay estrategia guardada donde asociar la contrarréplica' });
    }

    strategy.counterReplica = latestCounterReplica;
    chat.lastModified = new Date().toISOString();
    chat.markModified('savedStrategies');
    await chat.save();

    res.json({ success: true, counterReplica: latestCounterReplica, strategyId: strategy.id });
  } catch (error: any) {
    console.error('Error al guardar contrarréplica:', error);
    res.status(500).json({ error: error.message || 'Error al guardar contrarréplica' });
  }
};

const EVIDENCE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

// POST /api/defense-chat/:chatId/evidence/upload
export const uploadEvidence = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { accountId, exhibitNumber, type, description, dateObtained, status } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const user = (req as any).user;
    const userId = user?.userId || '';

    const chat = await DefenseChat.findOne({ _id: chatId, accountId, createdBy: userId });
    if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

    // Validar cuota
    const quotaAgg = await DefenseEvidence.aggregate([
      { $match: { createdBy: userId, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$fileSize' } } }
    ]);
    const usedBytes = quotaAgg[0]?.total || 0;
    if (usedBytes + req.file.size > EVIDENCE_QUOTA_BYTES) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(413).json({ error: 'Cuota de almacenamiento excedida (10 GB)' });
    }

    const evidence = await DefenseEvidence.create({
      _id: Date.now().toString(),
      chatId,
      accountId,
      createdBy: userId,
      exhibitNumber: exhibitNumber || '',
      type: type || '',
      description: description || '',
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      publicToken: randomUUID(),
      dateObtained: dateObtained || '',
      status: status || 'pending',
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json(evidence.toJSON());
  } catch (error) {
    console.error('Error al subir evidencia:', error);
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Error al subir evidencia' });
  }
};

// GET /api/defense-chat/evidence/library
export const getEvidenceLibrary = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const docs = await DefenseEvidence.find({ accountId: accountId as string, createdBy: user?.userId || '', isDeleted: false }).sort({ createdAt: -1 });
    res.json(docs.map(d => d.toJSON()));
  } catch (error) {
    console.error('Error al obtener biblioteca:', error);
    res.status(500).json({ error: 'Error al obtener biblioteca' });
  }
};

// GET /api/defense-chat/evidence/trash
export const getEvidenceTrash = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const docs = await DefenseEvidence.find({ accountId: accountId as string, createdBy: user?.userId || '', isDeleted: true }).sort({ deletedAt: -1 });
    res.json(docs.map(d => d.toJSON()));
  } catch (error) {
    console.error('Error al obtener papelera:', error);
    res.status(500).json({ error: 'Error al obtener papelera' });
  }
};

// POST /api/defense-chat/evidence/:evidenceId/trash
export const trashEvidence = async (req: Request, res: Response) => {
  try {
    const { evidenceId } = req.params;
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const evidence = await DefenseEvidence.findOne({ _id: evidenceId, accountId, createdBy: user?.userId || '' });
    if (!evidence) return res.status(404).json({ error: 'Prueba no encontrada' });
    evidence.isDeleted = true;
    evidence.deletedAt = new Date().toISOString();
    await evidence.save();
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al mover a papelera:', error);
    res.status(500).json({ error: 'Error al mover a papelera' });
  }
};

// POST /api/defense-chat/evidence/:evidenceId/restore
export const restoreEvidence = async (req: Request, res: Response) => {
  try {
    const { evidenceId } = req.params;
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const evidence = await DefenseEvidence.findOne({ _id: evidenceId, accountId, createdBy: user?.userId || '' });
    if (!evidence) return res.status(404).json({ error: 'Prueba no encontrada' });
    evidence.isDeleted = false;
    evidence.deletedAt = null;
    await evidence.save();
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al restaurar:', error);
    res.status(500).json({ error: 'Error al restaurar' });
  }
};

// DELETE /api/defense-chat/evidence/:evidenceId/permanent
export const permanentDeleteEvidence = async (req: Request, res: Response) => {
  try {
    const { evidenceId } = req.params;
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const evidence = await DefenseEvidence.findOne({ _id: evidenceId, accountId: accountId as string, createdBy: user?.userId || '' });
    if (!evidence) return res.status(404).json({ error: 'Prueba no encontrada' });
    if (evidence.filePath) {
      await fs.unlink(evidence.filePath).catch(() => {});
    }
    await DefenseEvidence.deleteOne({ _id: evidenceId });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar permanentemente:', error);
    res.status(500).json({ error: 'Error al eliminar' });
  }
};

// GET /api/defense-chat/evidence/quota
export const getEvidenceQuota = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const user = (req as any).user;
    const quotaAgg = await DefenseEvidence.aggregate([
      { $match: { createdBy: user?.userId || '', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$fileSize' } } }
    ]);
    const used = quotaAgg[0]?.total || 0;
    res.json({ used, limit: EVIDENCE_QUOTA_BYTES });
  } catch (error) {
    console.error('Error al obtener cuota:', error);
    res.status(500).json({ error: 'Error al obtener cuota' });
  }
};
