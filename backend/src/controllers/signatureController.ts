import { Request, Response } from 'express';
import { verifyOwnership } from '../middleware/auth.js';
import {
  createSignatureRequest,
  createSignatureRequestFromUpload,
  getSignatureByToken,
  markAsOpened,
  submitSignature,
  resendSignatureEmail,
  getSignatureRequestsForChat,
  getSignatureRequestsForClient,
  getSignatureRequestById,
} from '../services/signatureService.js';
import { GeneratedContract } from '../models/GeneratedContract.js';
import { ContractChat } from '../models/ContractChat.js';
import { Client } from '../models/Client.js';
import { SignatureRequest } from '../models/SignatureRequest.js';
import fs from 'fs/promises';

// POST /api/signatures — Create and send signature request (protected)
export const sendForSignature = async (req: Request, res: Response) => {
  try {
    const { generatedContractId, clientId, signerEmail, signerName, message, customFileName } = req.body;

    if (!generatedContractId || !clientId || !signerEmail || !signerName) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Verify ownership of the generated contract
    const contract = await GeneratedContract.findById(generatedContractId);
    if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

    const chat = await ContractChat.findById(contract.chatId);
    if (!chat || !verifyOwnership(req, chat.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const result = await createSignatureRequest({
      generatedContractId,
      chatId: contract.chatId,
      clientId,
      accountId: chat.accountId,
      signerEmail,
      signerName,
      message,
      customFileName,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error creating signature request:', error);
    res.status(500).json({ error: error.message || 'Error al crear solicitud de firma' });
  }
};

// GET /api/signatures/chat/:chatId — Get signature requests for a chat (protected)
export const getSignaturesForChat = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const chat = await ContractChat.findById(chatId);
    if (!chat || !verifyOwnership(req, chat.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const requests = await getSignatureRequestsForChat(chatId);
    res.json(requests);
  } catch (error) {
    console.error('Error getting signatures for chat:', error);
    res.status(500).json({ error: 'Error al obtener solicitudes de firma' });
  }
};

// GET /api/signatures/client/:clientId — Get signature requests for a client (protected)
export const getSignaturesForClient = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const requests = await getSignatureRequestsForClient(clientId);
    if (requests.length > 0 && !verifyOwnership(req, requests[0].accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(requests);
  } catch (error) {
    console.error('Error getting signatures for client:', error);
    res.status(500).json({ error: 'Error al obtener solicitudes de firma' });
  }
};

// POST /api/signatures/:id/resend — Resend signature email (protected)
export const resendSignature = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sigReq = await getSignatureRequestById(id);
    if (!sigReq || !verifyOwnership(req, sigReq.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const updated = await resendSignatureEmail(id);
    res.json(updated);
  } catch (error: any) {
    console.error('Error resending signature:', error);
    res.status(500).json({ error: error.message || 'Error al reenviar solicitud' });
  }
};

// GET /api/signatures/:id/download-signed — Download signed PDF (protected)
export const downloadSignedPdf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sigReq = await getSignatureRequestById(id);
    if (!sigReq || !verifyOwnership(req, sigReq.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    if (sigReq.status !== 'signed' || !sigReq.signedFilePath) {
      return res.status(400).json({ error: 'El documento aún no ha sido firmado' });
    }

    let fileName = 'documento_firmado.pdf';
    if (sigReq.generatedContractId) {
      const contract = await GeneratedContract.findById(sigReq.generatedContractId);
      if (contract) fileName = contract.fileName.replace('.pdf', '_firmado.pdf');
    }
    if (fileName === 'documento_firmado.pdf' && sigReq.clientId) {
      const client = await Client.findById(sigReq.clientId);
      if (client) {
        const fileEntry = client.files.find((f: any) => f.signatureRequestId === sigReq._id);
        if (fileEntry) fileName = (fileEntry as any).name.replace('.pdf', '_firmado.pdf');
      }
    }

    res.download(sigReq.signedFilePath, fileName);
  } catch (error) {
    console.error('Error downloading signed PDF:', error);
    res.status(500).json({ error: 'Error al descargar documento firmado' });
  }
};

// POST /api/signatures/upload-sign — Upload PDF and send for signature (protected)
export const uploadAndSign = async (req: Request, res: Response) => {
  try {
    const { clientId, fileName, description } = req.body;
    const file = req.file;

    if (!clientId || !file) {
      return res.status(400).json({ error: 'clientId and file are required' });
    }

    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (!verifyOwnership(req, client.accountId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!client.email) {
      return res.status(400).json({ error: 'NO_CLIENT_EMAIL' });
    }

    const result = await createSignatureRequestFromUpload({
      clientId,
      accountId: client.accountId,
      signerEmail: client.email,
      signerName: client.name,
      originalFilePath: file.path,
      fileName: fileName || file.originalname,
      description,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error in upload-and-sign:', error);
    res.status(500).json({ error: error.message || 'Error sending signature request' });
  }
};

// === PUBLIC ROUTES (no auth) ===

// GET /api/sign/:token — Get document info for signing page (public)
export const getSigningInfo = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const sigReq = await getSignatureByToken(token);

    if (!sigReq) {
      return res.status(404).json({ error: 'Enlace de firma no válido' });
    }

    if (sigReq.status === 'signed') {
      return res.json({
        status: 'signed',
        signerName: sigReq.signerName,
        signedAt: sigReq.signedAt,
      });
    }

    if (sigReq.status === 'expired') {
      return res.json({ status: 'expired' });
    }

    // Mark as opened/pending
    await markAsOpened(token);

    let contractName = 'Documento';
    if (sigReq.generatedContractId) {
      const contract = await GeneratedContract.findById(sigReq.generatedContractId);
      if (contract) contractName = contract.fileName;
    }
    if (contractName === 'Documento' && sigReq.clientId) {
      const client = await Client.findById(sigReq.clientId);
      if (client) {
        const fileEntry = client.files.find((f: any) => f.signatureRequestId === sigReq._id);
        if (fileEntry) contractName = (fileEntry as any).name;
      }
    }

    res.json({
      status: sigReq.status === 'sent' ? 'pending' : sigReq.status,
      signerName: sigReq.signerName,
      signerEmail: sigReq.signerEmail,
      contractName,
      expiresAt: sigReq.expiresAt,
    });
  } catch (error) {
    console.error('Error getting signing info:', error);
    res.status(500).json({ error: 'Error al obtener información de firma' });
  }
};

// GET /api/sign/:token/pdf — Serve the PDF for viewing (public)
export const getSigningPdf = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const sigReq = await getSignatureByToken(token);

    if (!sigReq || sigReq.status === 'expired') {
      return res.status(404).json({ error: 'Enlace de firma no válido o expirado' });
    }

    if (sigReq.status === 'signed') {
      return res.status(400).json({ error: 'Este documento ya ha sido firmado' });
    }

    // Check file exists
    try {
      await fs.access(sigReq.originalFilePath);
    } catch {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    const pdfBuffer = await fs.readFile(sigReq.originalFilePath);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error serving signing PDF:', error);
    res.status(500).json({ error: 'Error al obtener PDF' });
  }
};

// POST /api/sign/:token/submit — Submit signature (public)
export const submitSignatureHandler = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { signatureDataUrl } = req.body;

    if (!signatureDataUrl) {
      return res.status(400).json({ error: 'Firma requerida' });
    }

    // Validate it's a base64 PNG data URL
    if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ error: 'Formato de firma no válido' });
    }

    const signerIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';

    const result = await submitSignature(token, signatureDataUrl, signerIp);

    res.json({
      status: 'signed',
      signedAt: result.signedAt,
    });
  } catch (error: any) {
    console.error('Error submitting signature:', error);
    res.status(400).json({ error: error.message || 'Error al procesar firma' });
  }
};
