import { Request, Response } from 'express';
import { verifyOwnership } from '../middleware/auth.js';
import { Chat } from '../models/Chat.js';
import { DefenseChat } from '../models/DefenseChat.js';
import { AssistantChat } from '../models/AssistantChat.js';
import { ContractChat } from '../models/ContractChat.js';
import { DocumentSummariesChat } from '../models/DocumentSummariesChat.js';
import { FiscalChat } from '../models/FiscalChat.js';
import { Client } from '../models/Client.js';

const MODEL_MAP: Record<string, any> = {
  client: Chat,
  defense: DefenseChat,
  assistant: AssistantChat,
  contract: ContractChat,
  summaries: DocumentSummariesChat,
  fiscal: FiscalChat,
};

async function canAccessChat(req: Request, chatType: string, chat: any): Promise<boolean> {
  const user = (req as any).user;
  if (!user) return false;

  let accountId = chat.accountId;
  if (chatType === 'client') {
    const client = await Client.findById(chat.clientId);
    if (!client) return false;
    accountId = client.accountId;
  }

  if (!accountId || !verifyOwnership(req, accountId)) return false;
  if (chat.createdBy && chat.createdBy !== user.userId) return false;
  return true;
}

export async function flagMessage(req: Request, res: Response) {
  try {
    const { chatType, chatId, messageId } = req.params;
    const Model = MODEL_MAP[chatType];
    if (!Model) return res.status(400).json({ error: 'Invalid chatType' });

    const chat = await Model.findById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (!(await canAccessChat(req, chatType, chat))) return res.status(403).json({ error: 'Acceso denegado' });

    const message = (chat.messages as any[]).find((m: any) => m.id === messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    if (!message.flags) message.flags = [];
    message.flags.push({
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    });

    chat.markModified('messages');
    await chat.save();

    res.json({ success: true, flags: message.flags });
  } catch (err) {
    console.error('[flagMessage] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function unflagMessage(req: Request, res: Response) {
  try {
    const { chatType, chatId, messageId, flagId } = req.params;
    const Model = MODEL_MAP[chatType];
    if (!Model) return res.status(400).json({ error: 'Invalid chatType' });

    const chat = await Model.findById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (!(await canAccessChat(req, chatType, chat))) return res.status(403).json({ error: 'Acceso denegado' });

    const message = (chat.messages as any[]).find((m: any) => m.id === messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    if (!message.flags || message.flags.length === 0) {
      return res.json({ success: true, flags: [] });
    }

    message.flags = message.flags.filter((f: any) => f.id !== flagId);

    chat.markModified('messages');
    await chat.save();

    res.json({ success: true, flags: message.flags });
  } catch (err) {
    console.error('[unflagMessage] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
