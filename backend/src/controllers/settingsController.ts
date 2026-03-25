import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { SpecialtiesSettings } from '../models/SpecialtiesSettings.js';
import { verifyOwnership } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_PATH = path.join(__dirname, '../../uploads/logo.png');

// POST /api/settings/logo - Subir logo
export const uploadLogo = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    
    if (!file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    // Verificar que sea una imagen
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'El archivo debe ser una imagen' });
    }

    // Guardar como logo.png
    await fs.copyFile(file.path, LOGO_PATH);

    // Eliminar archivo temporal de multer
    await fs.unlink(file.path);

    res.json({ message: 'Logo actualizado exitosamente' });
  } catch (error) {
    console.error('Error al subir logo:', error);
    res.status(500).json({ error: 'Error al subir el logo' });
  }
};

// GET /api/settings/logo - Verificar si existe logo
export const hasLogo = async (req: Request, res: Response) => {
  try {
    await fs.access(LOGO_PATH);
    res.json({ hasLogo: true });
  } catch {
    res.json({ hasLogo: false });
  }
};

// DELETE /api/settings/logo - Eliminar logo
export const deleteLogo = async (req: Request, res: Response) => {
  try {
    await fs.unlink(LOGO_PATH);
    res.json({ message: 'Logo eliminado exitosamente' });
  } catch (error) {
    res.status(404).json({ error: 'No hay logo para eliminar' });
  }
};

// GET /api/settings/specialties?accountId=xxx - Obtener especialidades IA seleccionadas
export const getSpecialties = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });

    const accountSetting = await SpecialtiesSettings.findById(accountId as string);

    res.json({
      accountId,
      specialties: accountSetting?.specialties || []
    });
  } catch (error) {
    console.error('Error al obtener especialidades IA:', error);
    res.status(500).json({ error: 'Error al obtener especialidades IA' });
  }
};

// PUT /api/settings/specialties - Guardar especialidades IA seleccionadas
export const updateSpecialties = async (req: Request, res: Response) => {
  try {
    const { accountId, specialties } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });

    if (!Array.isArray(specialties)) {
      return res.status(400).json({ error: 'specialties debe ser un array' });
    }

    const normalizedSpecialties = specialties
      .filter((item: unknown) => typeof item === 'string')
      .map((item: string) => item.trim())
      .filter((item: string) => item.length > 0);

    const updated = await SpecialtiesSettings.findByIdAndUpdate(
      accountId,
      { specialties: normalizedSpecialties, accountId },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true, ...updated!.toJSON() });
  } catch (error) {
    console.error('Error al actualizar especialidades IA:', error);
    res.status(500).json({ error: 'Error al actualizar especialidades IA' });
  }
};
