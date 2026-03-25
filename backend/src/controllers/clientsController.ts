import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '../models/Client.js';
import { verifyOwnership } from '../middleware/auth.js';
import { Invoice, InvoiceSettings } from '../models/Invoice.js';
import { Automation } from '../models/Automation.js';
import { PLATFORM_CONFIGS, CuentaCorreoConfig } from '../services/emailService.js';
import { decryptPassword } from '../services/emailProcessorService.js';
import nodemailer from 'nodemailer';
import { sanitizeFilename } from '../utils/sanitizeFilename.js';
import { dispatchWebhook } from '../services/webhookService.js';

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

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ error: 'Acceso denegado' });
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

    if (!verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const clientId = Date.now().toString();
    const files: any[] = [];
    const reqFiles = (req as any).files as any[];
    
    if (reqFiles && reqFiles.length > 0) {
      const clientDir = await ensureClientDir(clientId);
      
      for (const file of reqFiles) {
        const oldPath = file.path;
        const safeName = sanitizeFilename(file.originalname);
        const newFilename = Date.now() + '_' + Math.round(Math.random() * 1E9) + '_' + safeName;
        const newPath = path.join(clientDir, newFilename);
        
        await fs.rename(oldPath, newPath);
        
        let extractedText: string | undefined;
        if (safeName.toLowerCase().endsWith('.pdf')) {
          extractedText = await extractTextFromPDF(newPath);
        }
        
        files.push({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          name: safeName,
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

    dispatchWebhook(accountId, 'new_client', { clientId: newClient._id, name: newClient.name, email: newClient.email }).catch(() => {});

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

    if (!verifyOwnership(req, client.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
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
        const safeName = sanitizeFilename(file.originalname);
        const newFilename = Date.now() + '_' + Math.round(Math.random() * 1E9) + '_' + safeName;
        const newPath = path.join(clientDir, newFilename);
        
        await fs.rename(oldPath, newPath);
        
        let extractedText: string | undefined;
        if (safeName.toLowerCase().endsWith('.pdf')) {
          extractedText = await extractTextFromPDF(newPath);
        }
        
        client.files.push({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          name: safeName,
          date: new Date().toISOString().split('T')[0],
          filePath: `uploads/clients/${id}/${newFilename}`,
          ...(extractedText && { extractedText })
        } as any);
      }
    }

    await client.save();
    dispatchWebhook(client.accountId, 'client_updated', { clientId: client._id, name: client.name, email: client.email, phone: client.phone });
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

    if (!verifyOwnership(req, client.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    // Eliminar carpeta de archivos del cliente
    const clientDir = path.join(UPLOADS_DIR, id);
    try {
      await fs.rm(clientDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error al eliminar carpeta del cliente:', error);
    }

    await Client.findByIdAndDelete(id);
    dispatchWebhook(client.accountId, 'client_deleted', { clientId: id, name: client.name, email: client.email });

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

    const client = await Client.findById(id);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    if (!verifyOwnership(req, client.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    client.status = status;
    await client.save();

    res.json(client.toJSON());
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
};

// PATCH /api/clients/:id/notes - Update client notes
export const updateClientNotes = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes debe ser un string' });
    }

    const client = await Client.findById(id);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    if (!verifyOwnership(req, client.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    client.notes = notes;
    await client.save();

    res.json(client.toJSON());
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar notas' });
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

    if (!verifyOwnership(req, client.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const file = client.files.find((f: any) => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const filePath = path.isAbsolute(file.filePath)
      ? file.filePath
      : path.join(__dirname, '../..', file.filePath);
    
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
const MAX_CLIENT_STORAGE = 100 * 1024 * 1024; // 100MB per client

export const uploadClientFile = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const client = await Client.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    if (!verifyOwnership(req, client.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const file = (req as any).file;
    
    if (!file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    // Check total storage for this client
    const currentUsage = client.files.reduce((total: number, f: any) => total + (f.fileSize || 0), 0);
    if (currentUsage + file.size > MAX_CLIENT_STORAGE) {
      // Delete the uploaded file since we're rejecting it
      try {
        const uploadedPath = path.join(UPLOADS_DIR, clientId, file.filename);
        await fs.unlink(uploadedPath);
      } catch (_) {}
      const usedMB = (currentUsage / (1024 * 1024)).toFixed(1);
      const limitMB = (MAX_CLIENT_STORAGE / (1024 * 1024)).toFixed(0);
      return res.status(413).json({ error: 'STORAGE_LIMIT', usedMB, limitMB });
    }

    // Extraer texto si es PDF
    const safeName = sanitizeFilename(file.originalname);
    let extractedText: string | undefined;
    if (safeName.toLowerCase().endsWith('.pdf')) {
      const filePath = path.join(UPLOADS_DIR, clientId, file.filename);
      extractedText = await extractTextFromPDF(filePath);
    }

    const newFile = {
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      name: safeName,
      date: new Date().toISOString().split('T')[0],
      filePath: `uploads/clients/${clientId}/${file.filename}`,
      fileSize: file.size,
      ...(extractedText && { extractedText })
    };

    client.files.push(newFile as any);
    await client.save();
    dispatchWebhook(client.accountId, 'file_uploaded', { clientId: clientId, fileName: safeName, fileId: newFile.id });

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

    if (!verifyOwnership(req, client.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
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
    dispatchWebhook(client.accountId, 'file_deleted', { clientId, fileId, fileName: file.name });

    res.json({ message: 'Archivo eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar archivo' });
  }
};

// ── TIMER ENTRIES ──

// POST /api/clients/:id/timer-entries
export const addTimerEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { duration, date, time } = req.body;
    if (typeof duration !== 'number' || !date || !time) {
      return res.status(400).json({ error: 'duration, date y time son requeridos' });
    }
    const client = await Client.findById(id);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!verifyOwnership(req, client.accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    const entry = { id: Date.now().toString(), duration, date, time };
    client.timerEntries.push(entry as any);
    await client.save();
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Error al añadir tiempo' });
  }
};

// DELETE /api/clients/:id/timer-entries/:entryId
export const deleteTimerEntry = async (req: Request, res: Response) => {
  try {
    const { id, entryId } = req.params;
    const client = await Client.findById(id);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!verifyOwnership(req, client.accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    client.timerEntries = client.timerEntries.filter((e: any) => e.id !== entryId);
    await client.save();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar tiempo' });
  }
};

// ── INVOICE SETTINGS ──

// GET /api/invoice-settings
export const getInvoiceSettings = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    let settings = await InvoiceSettings.findOne({ accountId: accountId as string });
    if (!settings) {
      settings = await InvoiceSettings.create({
        _id: (accountId as string) + '_settings',
        accountId: accountId as string,
        firmName: '', firmAddress: '', firmPhone: '', paymentMethod: '',
        defaultTaxRate: 21, nextInvoiceNumber: 1,
      });
    }
    res.json(settings.toJSON());
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

// PUT /api/invoice-settings
export const updateInvoiceSettings = async (req: Request, res: Response) => {
  try {
    const { accountId, firmName, firmAddress, firmPhone, paymentMethod, defaultTaxRate } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    const settings = await InvoiceSettings.findOneAndUpdate(
      { accountId },
      { $set: { firmName, firmAddress, firmPhone, paymentMethod, defaultTaxRate } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    if (!settings) return res.status(500).json({ error: 'Error al guardar' });
    res.json(settings.toJSON());
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
};

// ── INVOICES ──

// GET /api/clients/:id/invoices
export const getClientInvoices = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = await Client.findById(id);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!verifyOwnership(req, client.accountId)) return res.status(403).json({ error: 'Acceso denegado' });
    const invoices = await Invoice.find({ clientId: id }).sort({ date: -1 });
    res.json(invoices.map(i => i.toJSON()));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
};

// POST /api/clients/:id/invoices
export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { accountId, firmName, firmAddress, firmPhone, paymentMethod, taxRate, lines } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });

    const client = await Client.findById(id);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!verifyOwnership(req, client.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    // Get and increment invoice number
    let settings = await InvoiceSettings.findOne({ accountId });
    if (!settings) {
      settings = await InvoiceSettings.create({
        _id: accountId + '_settings', accountId,
        firmName: '', firmAddress: '', firmPhone: '', paymentMethod: '',
        defaultTaxRate: 21, nextInvoiceNumber: 1,
      });
    }
    const year = new Date().getFullYear();
    const num = settings.nextInvoiceNumber || 1;
    const invoiceNumber = `${year}-${String(num).padStart(3, '0')}`;
    settings.nextInvoiceNumber = num + 1;
    await settings.save();

    // Calculate totals
    const baseAmount = (lines || []).reduce((sum: number, l: any) => sum + (l.subtotal || 0), 0);
    const rate = taxRate ?? 21;
    const taxAmount = Math.round(baseAmount * rate) / 100;
    const totalAmount = baseAmount + taxAmount;

    const invoice = await Invoice.create({
      _id: Date.now().toString(),
      clientId: id,
      accountId,
      invoiceNumber,
      date: new Date().toISOString().split('T')[0],
      firmName: firmName || '',
      firmAddress: firmAddress || '',
      firmPhone: firmPhone || '',
      paymentMethod: paymentMethod || '',
      clientName: client.name,
      clientEmail: client.email,
      clientPhone: client.phone,
      taxRate: rate,
      lines: (lines || []).map((l: any) => ({
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        concept: l.concept || '',
        quantity: l.quantity || 1,
        price: l.price || 0,
        subtotal: l.subtotal || 0,
      })),
      baseAmount,
      taxAmount,
      totalAmount,
    });

    dispatchWebhook(accountId, 'invoice_created', { invoiceId: invoice._id, invoiceNumber, clientId: id, clientName: client.name, totalAmount });
    res.status(201).json(invoice.toJSON());
  } catch (error) {
    console.error('Error al crear factura:', error);
    res.status(500).json({ error: 'Error al crear factura' });
  }
};

// DELETE /api/invoices/:invoiceId
export const deleteInvoice = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
    if (!verifyOwnership(req, invoice.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    await Invoice.findByIdAndDelete(invoiceId);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar factura:', error);
    res.status(500).json({ error: 'Error al eliminar factura' });
  }
};

// PUT /api/invoices/:invoiceId
export const updateInvoice = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { accountId, firmName, firmAddress, firmPhone, paymentMethod, taxRate, lines } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
    if (!verifyOwnership(req, invoice.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const baseAmount = (lines || []).reduce((sum: number, l: any) => sum + (l.subtotal || 0), 0);
    const rate = taxRate ?? invoice.taxRate;
    const taxAmount = Math.round(baseAmount * rate) / 100;
    const totalAmount = baseAmount + taxAmount;

    invoice.firmName = firmName ?? invoice.firmName;
    invoice.firmAddress = firmAddress ?? invoice.firmAddress;
    invoice.firmPhone = firmPhone ?? invoice.firmPhone;
    invoice.paymentMethod = paymentMethod ?? invoice.paymentMethod;
    invoice.taxRate = rate;
    invoice.lines = (lines || []).map((l: any) => ({
      id: l.id || Date.now().toString() + Math.random().toString(36).substring(7),
      concept: l.concept || '',
      quantity: l.quantity || 1,
      price: l.price || 0,
      subtotal: l.subtotal || 0,
    }));
    invoice.baseAmount = baseAmount;
    invoice.taxAmount = taxAmount;
    invoice.totalAmount = totalAmount;

    await invoice.save();
    dispatchWebhook(accountId, 'invoice_updated', { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, totalAmount });
    res.json(invoice.toJSON());
  } catch (error) {
    console.error('Error al actualizar factura:', error);
    res.status(500).json({ error: 'Error al actualizar factura' });
  }
};

// POST /api/invoices/:invoiceId/send
export const sendInvoiceEmail = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { accountId, cuentaCorreoId, pdfBase64, recipientEmail, message } = req.body;
    if (!accountId || !cuentaCorreoId || !pdfBase64) {
      return res.status(400).json({ error: 'accountId, cuentaCorreoId y pdfBase64 son requeridos' });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
    if (!verifyOwnership(req, invoice.accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    // Get email account
    const automation = await Automation.findOne({ accountId });
    if (!automation) return res.status(404).json({ error: 'No hay cuentas de correo configuradas' });
    const cuenta = automation.cuentasCorreo.find((c: any) => c.id === cuentaCorreoId);
    if (!cuenta) return res.status(404).json({ error: 'Cuenta de correo no encontrada' });

    // Build SMTP config
    const plat = cuenta.plataforma.toLowerCase().replace(/\s+/g, '');
    let smtpHost: string, smtpPort: number, secure: boolean;
    if (plat === 'custom') {
      smtpHost = (cuenta as any).customSmtpHost || '';
      smtpPort = (cuenta as any).customSmtpPort || 587;
      secure = smtpPort === 465;
    } else {
      const cfg = PLATFORM_CONFIGS[plat] ?? PLATFORM_CONFIGS['gmail'];
      smtpHost = cfg.smtpHost;
      smtpPort = cfg.smtpPort;
      secure = false;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure,
      auth: { user: cuenta.correo, pass: decryptPassword(cuenta.password) },
    });

    const toEmail = recipientEmail || invoice.clientEmail;
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    await transporter.sendMail({
      from: cuenta.correo,
      to: toEmail,
      subject: `Factura ${invoice.invoiceNumber}`,
      text: message || '',
      attachments: [{ filename: `Factura_${invoice.invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });

    transporter.close();

    invoice.sentAt = new Date().toISOString();
    invoice.sentFrom = cuenta.correo;
    await invoice.save();

    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error al enviar factura:', error);
    res.status(500).json({ error: error.message || 'Error al enviar factura' });
  }
};

// GET /api/email-accounts - Get available email accounts for sending
export const getEmailAccounts = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });
    if (!verifyOwnership(req, accountId as string)) return res.status(403).json({ error: 'Acceso denegado' });
    const automation = await Automation.findOne({ accountId: accountId as string });
    if (!automation) return res.json([]);
    res.json(automation.cuentasCorreo.map((c: any) => ({
      id: c.id, plataforma: c.plataforma, correo: c.correo,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cuentas' });
  }
};
