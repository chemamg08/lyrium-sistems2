import { Router, Request, Response } from 'express';
import { uploadImproveAI } from '../config/multerImproveAI.js';
import { ImproveAIFolder, ImproveAIFile, ImproveAIFragment } from '../models/ImproveAIFile.js';
import { processImproveAIFile, resolveAccountId } from '../services/ragService.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_STORAGE_BYTES = 600 * 1024 * 1024; // 600MB per account group

const router = Router();

// GET /api/improve-ai/folders?accountId=xxx&parentFolder=yyy
router.get('/folders', async (req: Request, res: Response) => {
  try {
    const { accountId, parentFolder } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId es requerido' });
    const rootId = await resolveAccountId(accountId as string);
    const query: any = { accountId: rootId };
    query.parentFolder = parentFolder ? parentFolder as string : null;
    const folders = await ImproveAIFolder.find(query).sort({ name: 1 });
    res.json(folders);
  } catch (error) {
    console.error('Error listing folders:', error);
    res.status(500).json({ error: 'Error al listar carpetas' });
  }
});

// GET /api/improve-ai/files?accountId=xxx&folderId=yyy
router.get('/files', async (req: Request, res: Response) => {
  try {
    const { accountId, folderId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId es requerido' });
    const rootId = await resolveAccountId(accountId as string);
    const query: any = { accountId: rootId };
    query.folderId = folderId ? folderId as string : null;
    const files = await ImproveAIFile.find(query).sort({ uploadedAt: -1 });
    res.json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Error al listar archivos' });
  }
});

// POST /api/improve-ai/folders
router.post('/folders', async (req: Request, res: Response) => {
  try {
    const { accountId, name, parentFolder } = req.body;
    if (!accountId || !name) return res.status(400).json({ error: 'accountId y name son requeridos' });
    const rootId = await resolveAccountId(accountId);
    const folder = new ImproveAIFolder({
      _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      accountId: rootId,
      name: name.trim(),
      parentFolder: parentFolder || null,
    });
    await folder.save();
    res.status(201).json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Error al crear carpeta' });
  }
});

// POST /api/improve-ai/upload
router.post('/upload', uploadImproveAI.array('files', 10), async (req: Request, res: Response) => {
  try {
    const { accountId, folderId, uploadedBy } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId es requerido' });
    const rootId = await resolveAccountId(accountId);

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No se recibieron archivos' });

    // Check storage limit
    const currentUsage = await ImproveAIFile.aggregate([
      { $match: { accountId: rootId } },
      { $group: { _id: null, total: { $sum: '$size' } } }
    ]);
    const usedBytes = currentUsage[0]?.total || 0;
    const newBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (usedBytes + newBytes > MAX_STORAGE_BYTES) {
      // Clean up uploaded files
      for (const f of files) {
        await fs.unlink(f.path).catch(() => {});
      }
      return res.status(400).json({ error: 'Límite de almacenamiento alcanzado (600MB)' });
    }

    const results = [];
    for (const file of files) {
      const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const newFile = new ImproveAIFile({
        _id: fileId,
        accountId: rootId,
        folderId: folderId || null,
        originalName: sanitizeFilename(file.originalname),
        storagePath: file.path,
        size: file.size,
        uploadedBy: uploadedBy || accountId,
        processed: false,
        fragmentCount: 0,
      });
      await newFile.save();

      // Process in background (extract text, chunk, embed)
      processImproveAIFile(fileId, file.path, sanitizeFilename(file.originalname), rootId, folderId || null)
        .then(async (count) => {
          await ImproveAIFile.findByIdAndUpdate(fileId, { processed: true, fragmentCount: count });
        })
        .catch(async (err) => {
          console.error(`Error processing improve AI file ${fileId}:`, err);
          // Mark as processed with 0 fragments so user knows it failed
          await ImproveAIFile.findByIdAndUpdate(fileId, { processed: true, fragmentCount: 0 });
        });

      results.push(newFile);
    }

    res.status(201).json(results);
  } catch (error) {
    console.error('Error uploading improve AI files:', error);
    res.status(500).json({ error: 'Error al subir archivos' });
  }
});

// GET /api/improve-ai/view/:fileId
router.get('/view/:fileId', async (req: Request, res: Response) => {
  try {
    const file = await ImproveAIFile.findById(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });
    const filePath = file.storagePath;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    const stream = (await import('fs')).createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    console.error('Error viewing file:', error);
    res.status(500).json({ error: 'Error al ver archivo' });
  }
});

// DELETE /api/improve-ai/files/:fileId
router.delete('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const file = await ImproveAIFile.findById(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });

    // Delete physical file
    await fs.unlink(file.storagePath).catch(() => {});
    // Delete fragments
    await ImproveAIFragment.deleteMany({ fileId: file._id });
    // Delete DB record
    await ImproveAIFile.findByIdAndDelete(file._id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Error al eliminar archivo' });
  }
});

// DELETE /api/improve-ai/folders/:folderId
router.delete('/folders/:folderId', async (req: Request, res: Response) => {
  try {
    const folderId = req.params.folderId;
    const folder = await ImproveAIFolder.findById(folderId);
    if (!folder) return res.status(404).json({ error: 'Carpeta no encontrada' });

    // Recursively delete all subfolders and files
    await deleteFolderRecursive(folderId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Error al eliminar carpeta' });
  }
});

async function deleteFolderRecursive(folderId: string) {
  // Delete files in this folder
  const files = await ImproveAIFile.find({ folderId });
  for (const file of files) {
    await fs.unlink(file.storagePath).catch(() => {});
    await ImproveAIFragment.deleteMany({ fileId: file._id });
    await ImproveAIFile.findByIdAndDelete(file._id);
  }
  // Delete subfolders recursively
  const subfolders = await ImproveAIFolder.find({ parentFolder: folderId });
  for (const sub of subfolders) {
    await deleteFolderRecursive(sub._id);
  }
  // Delete the folder itself
  await ImproveAIFolder.findByIdAndDelete(folderId);
}

// GET /api/improve-ai/storage?accountId=xxx
router.get('/storage', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId es requerido' });
    const rootId = await resolveAccountId(accountId as string);
    const result = await ImproveAIFile.aggregate([
      { $match: { accountId: rootId } },
      { $group: { _id: null, total: { $sum: '$size' }, count: { $sum: 1 } } }
    ]);
    const used = result[0]?.total || 0;
    const count = result[0]?.count || 0;
    res.json({ usedBytes: used, maxBytes: MAX_STORAGE_BYTES, fileCount: count });
  } catch (error) {
    console.error('Error getting storage:', error);
    res.status(500).json({ error: 'Error al obtener almacenamiento' });
  }
});

// GET /api/improve-ai/has-files?accountId=xxx
router.get('/has-files', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId es requerido' });
    const rootId = await resolveAccountId(accountId as string);
    const count = await ImproveAIFragment.countDocuments({ accountId: rootId });
    res.json({ hasFiles: count > 0 });
  } catch (error) {
    res.json({ hasFiles: false });
  }
});

export default router;
