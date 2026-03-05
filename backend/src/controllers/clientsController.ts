import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '../models/Client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads/clients');

// Crear directorio para cliente si no existe
const ensureClientDir = async (clientId: string): Promise<string> => {
  const clientDir = path.join(UPLOADS_DIR, clientId);
  await fs.mkdir(clientDir, { recursive: true });
  return clientDir;
};

// Extraer texto de PDF
const extractTextFromPDF = async (filePath: string): Promise<string> => {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const pdfParseModule: any = await import('pdf-parse');
    const PDFParse = pdfParseModule.PDFParse;

    if (!PDFParse) {
      throw new Error('PDFParse no disponible en pdf-parse');
    }

    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    return result?.text || '';
  } catch (error) {
    console.error('Error al extraer texto del PDF:', error);
    return '';
  }
};

// GET /api/clients - Obtener todos los clientes
export const getClients = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }
    
    const clients = await Client.find({ accountId: accountId as string });
    res.json(clients.map(c => c.toJSON()));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
};

// POST /api/clients - Crear nuevo cliente
export const createClient = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, summary, accountId, clientType, fiscalInfo } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    const clientId = Date.now().toString();
    const files: any[] = [];
    const reqFiles = (req as any).files as any[];
    
    if (reqFiles && reqFiles.length > 0) {
      const clientDir = await ensureClientDir(clientId);
      
      for (const file of reqFiles) {
        const oldPath = file.path;
        const newFilename = Date.now() + '_' + Math.round(Math.random() * 1E9) + '_' + file.originalname;
        const newPath = path.join(clientDir, newFilename);
        
        await fs.rename(oldPath, newPath);
        
        let extractedText: string | undefined;
        if (file.originalname.toLowerCase().endsWith('.pdf')) {
          extractedText = await extractTextFromPDF(newPath);
        }
        
        files.push({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          name: file.originalname,
          date: new Date().toISOString().split('T')[0],
          filePath: `uploads/clients/${clientId}/${newFilename}`,
          ...(extractedText && { extractedText })
        });
      }
    }

    const { autoCreated, assignedSubaccountId } = req.body;

    const newClient = await Client.create({
      _id: clientId,
      name,
      email: email || '',
      phone: phone || '',
      cases: 0,
      status: 'abierto',
      summary: summary || '',
      files,
      accountId,
      clientType: clientType || 'particular',
      fiscalInfo: fiscalInfo ? (typeof fiscalInfo === 'string' ? JSON.parse(fiscalInfo) : fiscalInfo) : {},
      ...(autoCreated && { autoCreated: true }),
      ...(assignedSubaccountId && { assignedSubaccountId }),
    });

    res.status(201).json(newClient.toJSON());
  } catch (error) {
    console.error('Error al crear cliente:', error);
    res.status(500).json({ error: 'Error al crear cliente' });
  }
};

// PUT /api/clients/:id - Actualizar cliente
export const updateClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, phone, summary, clientType, fiscalInfo } = req.body;
    
    const client = await Client.findById(id);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Actualizar datos básicos
    if (name) client.name = name;
    if (email !== undefined) client.email = email;
    if (phone !== undefined) client.phone = phone;
    if (summary !== undefined) client.summary = summary;
    if (clientType !== undefined) client.clientType = clientType;
    if (fiscalInfo !== undefined) client.fiscalInfo = typeof fiscalInfo === 'string' ? JSON.parse(fiscalInfo) : fiscalInfo;

    // Añadir nuevos archivos si existen
    const reqFiles = (req as any).files as any[];
    
    if (reqFiles && reqFiles.length > 0) {
      const clientDir = await ensureClientDir(id);
      
      for (const file of reqFiles) {
        const oldPath = file.path;
        const newFilename = Date.now() + '_' + Math.round(Math.random() * 1E9) + '_' + file.originalname;
        const newPath = path.join(clientDir, newFilename);
        
        await fs.rename(oldPath, newPath);
        
        let extractedText: string | undefined;
        if (file.originalname.toLowerCase().endsWith('.pdf')) {
          extractedText = await extractTextFromPDF(newPath);
        }
        
        client.files.push({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          name: file.originalname,
          date: new Date().toISOString().split('T')[0],
          filePath: `uploads/clients/${id}/${newFilename}`,
          ...(extractedText && { extractedText })
        } as any);
      }
    }

    await client.save();
    res.json(client.toJSON());
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
};

// DELETE /api/clients/:id - Eliminar cliente
export const deleteClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = await Client.findById(id);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Eliminar carpeta de archivos del cliente
    const clientDir = path.join(UPLOADS_DIR, id);
    try {
      await fs.rm(clientDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error al eliminar carpeta del cliente:', error);
    }

    await Client.findByIdAndDelete(id);

    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
};

// PATCH /api/clients/:id/status - Actualizar estado del cliente
export const updateClientStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['abierto', 'finalizado'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const client = await Client.findByIdAndUpdate(id, { status }, { returnDocument: 'after' });

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json(client.toJSON());
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
};

// GET /api/clients/:clientId/files/:fileId - Servir archivo
export const getClientFile = async (req: Request, res: Response) => {
  try {
    const { clientId, fileId } = req.params;
    const client = await Client.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const file = client.files.find((f: any) => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const filePath = path.join(__dirname, '../..', file.filePath);
    
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Archivo no encontrado en disco' });
    }

    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener archivo' });
  }
};

// POST /api/clients/:clientId/files - Subir archivo a cliente existente
export const uploadClientFile = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const client = await Client.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const file = (req as any).file;
    
    if (!file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    // Extraer texto si es PDF
    let extractedText: string | undefined;
    if (file.originalname.toLowerCase().endsWith('.pdf')) {
      const filePath = path.join(UPLOADS_DIR, clientId, file.filename);
      extractedText = await extractTextFromPDF(filePath);
    }

    const newFile = {
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      name: file.originalname,
      date: new Date().toISOString().split('T')[0],
      filePath: `uploads/clients/${clientId}/${file.filename}`,
      ...(extractedText && { extractedText })
    };

    client.files.push(newFile as any);
    await client.save();

    res.status(201).json(newFile);
  } catch (error) {
    res.status(500).json({ error: 'Error al subir archivo' });
  }
};

// DELETE /api/clients/:clientId/files/:fileId - Eliminar archivo
export const deleteClientFile = async (req: Request, res: Response) => {
  try {
    const { clientId, fileId } = req.params;
    const client = await Client.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const fileIndex = client.files.findIndex((f: any) => f.id === fileId);

    if (fileIndex === -1) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const file = client.files[fileIndex];
    
    // Eliminar archivo físico
    const filePath = path.join(__dirname, '../..', file.filePath);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Error al eliminar archivo físico:', error);
    }

    // Eliminar del array
    client.files.splice(fileIndex, 1);
    await client.save();

    res.json({ message: 'Archivo eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar archivo' });
  }
};
