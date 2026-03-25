import { Request, Response } from 'express';
import { reviewLegalText } from '../services/aiService.js';
import { WritingText } from '../models/WritingText.js';
import { getAccountCountry } from '../services/legalKnowledgeService.js';
import { verifyOwnership } from '../middleware/auth.js';

// GET /api/writing-texts?accountId=xxx - Obtener todos los textos de una cuenta
export async function getAllWritingTexts(req: Request, res: Response) {
  try {
    const { accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ message: 'accountId es requerido' });
    }

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    const texts = await WritingText.find({ accountId });
    
    res.json(texts.map(t => t.toJSON()));
  } catch (error) {
    console.error('Error al obtener textos:', error);
    res.status(500).json({ message: 'Error al obtener textos' });
  }
}

// GET /api/writing-texts/:id?accountId=xxx - Obtener un texto específico
export async function getWritingTextById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ message: 'accountId es requerido' });
    }

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    const text = await WritingText.findOne({ _id: id, accountId });
    
    if (!text) {
      return res.status(404).json({ message: 'Texto no encontrado' });
    }

    res.json(text.toJSON());
  } catch (error) {
    console.error('Error al obtener texto:', error);
    res.status(500).json({ message: 'Error al obtener texto' });
  }
}

// POST /api/writing-texts - Crear nuevo texto
export async function createWritingText(req: Request, res: Response) {
  try {
    const { accountId, title, content } = req.body;
    
    if (!accountId || !title) {
      return res.status(400).json({ message: 'accountId y title son requeridos' });
    }

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    const newText = await WritingText.create({
      _id: Date.now().toString(),
      accountId,
      title,
      content: content || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    res.status(201).json(newText.toJSON());
  } catch (error) {
    console.error('Error al crear texto:', error);
    res.status(500).json({ message: 'Error al crear texto' });
  }
}

// PUT /api/writing-texts/:id - Actualizar texto
export async function updateWritingText(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { accountId, title, content } = req.body;
    
    if (!accountId) {
      return res.status(400).json({ message: 'accountId es requerido' });
    }

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    const existing = await WritingText.findOne({ _id: id, accountId });
    
    if (!existing) {
      return res.status(404).json({ message: 'Texto no encontrado' });
    }

    existing.title = title || existing.title;
    existing.content = content !== undefined ? content : existing.content;
    existing.updatedAt = new Date().toISOString();
    await existing.save();

    res.json(existing.toJSON());
  } catch (error) {
    console.error('Error al actualizar texto:', error);
    res.status(500).json({ message: 'Error al actualizar texto' });
  }
}

// DELETE /api/writing-texts/:id - Eliminar texto
export async function deleteWritingText(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ message: 'accountId es requerido' });
    }

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    const result = await WritingText.deleteOne({ _id: id, accountId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Texto no encontrado' });
    }

    res.json({ message: 'Texto eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar texto:', error);
    res.status(500).json({ message: 'Error al eliminar texto' });
  }
}

// POST /api/writing-texts/review - Revisar texto con IA
export async function reviewText(req: Request, res: Response) {
  try {
    const { text, accountId } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'text es requerido' });
    }

    if (accountId && !verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    const country = accountId ? await getAccountCountry(accountId) : undefined;
    const result = await reviewLegalText(text, country || undefined);
    res.json(result);
  } catch (error) {
    console.error('Error al revisar texto:', error);
    res.status(500).json({ message: 'Error al revisar texto' });
  }
}
