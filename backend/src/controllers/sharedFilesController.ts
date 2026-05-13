import { Request, Response } from 'express';
import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { SharedFile } from '../models/SharedFile.js';
import { Account } from '../models/Account.js';
import { Subaccount } from '../models/Subaccount.js';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';
import { verifyOwnership } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads/shared');

const cleanupUploadedFiles = async (files: Express.Multer.File[] = []) => {
  await Promise.all(files.map(async (file) => {
    try {
      await fsAsync.unlink(file.path);
    } catch {}
  }));
};

const resolveAuthenticatedSender = async (userId: string) => {
  const account = await Account.findById(userId).lean();
  if (account) {
    const subs = await Subaccount.find({ parentAccountId: userId }).lean();
    return {
      senderId: String((account as any)._id),
      senderName: account.name,
      groupMembers: subs.map((sub) => String((sub as any)._id)),
    };
  }

  const subaccount = await Subaccount.findById(userId).lean();
  if (!subaccount) return null;

  const mainAccount = await Account.findById(subaccount.parentAccountId).lean();
  if (!mainAccount) return null;

  const subs = await Subaccount.find({ parentAccountId: subaccount.parentAccountId }).lean();
  return {
    senderId: String((subaccount as any)._id),
    senderName: subaccount.name,
    groupMembers: [
      String((mainAccount as any)._id),
      ...subs
        .map((sub) => String((sub as any)._id))
        .filter((id) => id !== String((subaccount as any)._id)),
    ],
  };
};

// POST /upload  — multipart: files + recipientIds (JSON array string)
export const uploadAndShare = async (req: Request, res: Response) => {
  try {
    const { recipientIds } = req.body;
    const files = req.files as Express.Multer.File[];
    const authUserId = (req as any).user?.userId as string | undefined;

    if (!authUserId || !verifyOwnership(req, authUserId)) {
      await cleanupUploadedFiles(files);
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    if (!files || files.length === 0)
      return res.status(400).json({ error: 'No files uploaded' });

    let parsed: string[];
    try {
      parsed = Array.isArray(recipientIds)
        ? recipientIds
        : JSON.parse(recipientIds || '[]');
    } catch {
      await cleanupUploadedFiles(files);
      return res.status(400).json({ error: 'Destinatarios inválidos' });
    }

    const sender = await resolveAuthenticatedSender(authUserId);
    if (!sender) {
      await cleanupUploadedFiles(files);
      return res.status(404).json({ error: 'Remitente no encontrado' });
    }

    const allowedRecipients = new Set(sender.groupMembers);
    const uniqueRecipientIds = [...new Set(parsed.map((value) => String(value)))];

    if (uniqueRecipientIds.length === 0 || uniqueRecipientIds.some((id) => !allowedRecipients.has(id))) {
      await cleanupUploadedFiles(files);
      return res.status(400).json({ error: 'Destinatarios inválidos' });
    }

    const now = new Date().toISOString();
    const newEntries = await Promise.all(
      files.map(async (file) => {
        const doc = await SharedFile.create({
          _id: Date.now().toString() + '_' + Math.random().toString(36).slice(2),
          filename: file.filename,
          originalName: sanitizeFilename(file.originalname),
          senderId: sender.senderId,
          senderName: sender.senderName,
          recipientIds: uniqueRecipientIds,
          size: file.size,
          uploadedAt: now,
        });
        return doc.toJSON();
      })
    );

    res.json({ success: true, files: newEntries });
  } catch (error) {
    console.error('Error uploading shared file:', error);
    res.status(500).json({ error: 'Error al subir archivos' });
  }
};

// GET /shared?userId=X  — files sent by this user
export const getShared = async (req: Request, res: Response) => {
  const { userId } = req.query as { userId: string };
  if (!userId || !verifyOwnership(req, userId)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const docs = await SharedFile.find({ senderId: userId });
  res.json(docs.map((d) => d.toJSON()));
};

// GET /received?userId=X  — files received by this user
export const getReceived = async (req: Request, res: Response) => {
  const { userId } = req.query as { userId: string };
  if (!userId || !verifyOwnership(req, userId)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const docs = await SharedFile.find({ recipientIds: userId });
  res.json(docs.map((d) => d.toJSON()));
};

// DELETE /:fileId  — only sender can delete (removes for everyone)
export const deleteSharedFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const { userId } = req.body;

    if (!userId || !verifyOwnership(req, userId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const file = await SharedFile.findById(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    if (file.senderId !== userId)
      return res.status(403).json({ error: 'No autorizado' });

    try {
      await fsAsync.unlink(path.join(UPLOADS_DIR, file.filename));
    } catch {}

    await SharedFile.deleteOne({ _id: fileId });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting shared file:', error);
    res.status(500).json({ error: 'Error al eliminar' });
  }
};

// GET /download/:fileId?userId=X
export const downloadSharedFile = async (req: Request, res: Response) => {
  const { fileId } = req.params;
  const { userId } = req.query as { userId: string };

  if (!userId || !verifyOwnership(req, userId)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const file = await SharedFile.findById(fileId);
  if (!file) return res.status(404).json({ error: 'File not found' });

  if (file.senderId !== userId && !file.recipientIds.includes(userId))
    return res.status(403).json({ error: 'No autorizado' });

  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: 'File not found on disk' });

  res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
  res.sendFile(path.resolve(filePath));
};

// GET /group-members?accountId=X&userId=X  — all accounts in the group except current user
export const getGroupMembers = async (req: Request, res: Response) => {
  const { accountId, userId } = req.query as { accountId: string; userId: string };
  try {
    if (!accountId || !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const main = await Account.findById(accountId);
    const subs = await Subaccount.find({ parentAccountId: accountId });

    const members: { id: string; name: string; email: string; type: string }[] = [];
    if (main) members.push({ id: (main as any)._id, name: main.name, email: main.email, type: 'main' });
    subs.forEach((s) => members.push({ id: (s as any)._id, name: s.name, email: s.email, type: 'subaccount' }));

    res.json(members.filter((m) => m.id !== userId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error' });
  }
};
