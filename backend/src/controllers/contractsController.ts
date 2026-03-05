import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeContractPdf } from '../services/contractPdfService.js';
import { Contract } from '../models/Contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GET /api/contracts - Obtener todos los contratos
export const getContracts = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    
    // Filtrar por cuenta principal
    const filteredContracts = await Contract.find({ accountId });
    
    res.json(filteredContracts.map(c => c.toJSON()));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener contratos' });
  }
};

// POST /api/contracts - Crear nuevo contrato
export const createContract = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    
    if (!file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    const { name, summary, accountId } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    const newId = Date.now().toString();

    const newContract = await Contract.create({
      _id: newId,
      name,
      summary: summary || '',
      fileName: file.originalname,
      filePath: `uploads/${file.filename}`,
      accountId
    });

    // Analizar PDF en background (extraer texto)
    analyzeContractPdf(newId, file.path, file.originalname)
      .catch(err => console.error('Error analizando PDF en background:', err));

    res.status(201).json(newContract.toJSON());
  } catch (error) {
    res.status(500).json({ error: 'Error al crear contrato' });
  }
};

// GET /api/contracts/:id/file - Servir archivo
export const getContractFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contract = await Contract.findById(id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    const filePath = path.join(__dirname, '../..', contract.filePath);
    
    // Verificar que el archivo existe
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener archivo' });
  }
};

// DELETE /api/contracts/:id - Eliminar contrato
export const deleteContract = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contract = await Contract.findById(id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    // Eliminar archivo físico
    const filePath = path.join(__dirname, '../..', contract.filePath);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Error al eliminar archivo:', error);
    }

    // Eliminar de la base de datos
    await Contract.findByIdAndDelete(id);

    res.json({ message: 'Contrato eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar contrato' });
  }
};
