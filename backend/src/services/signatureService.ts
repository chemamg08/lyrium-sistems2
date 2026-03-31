import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb } from 'pdf-lib';
import nodemailer from 'nodemailer';
import { SignatureRequest } from '../models/SignatureRequest.js';
import { GeneratedContract } from '../models/GeneratedContract.js';
import { Client } from '../models/Client.js';
import { ContractChat } from '../models/ContractChat.js';
import { dispatchWebhook } from './webhookService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';
const SIGNATURE_EXPIRY_DAYS = 30;

function getSystemTransporter() {
  const port = Number(process.env.SYSTEM_EMAIL_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SYSTEM_EMAIL_HOST || 'smtp-relay.brevo.com',
    port,
    secure: port === 465,
    auth: {
      user: process.env.SYSTEM_EMAIL_LOGIN || process.env.SYSTEM_EMAIL_USER,
      pass: process.env.SYSTEM_EMAIL_PASS,
    },
  });
}

export async function createSignatureRequest(params: {
  generatedContractId: string;
  chatId: string;
  clientId: string;
  accountId: string;
  signerEmail: string;
  signerName: string;
  message?: string;
  customFileName?: string;
}): Promise<ISignatureRequestResult> {
  const contract = await GeneratedContract.findById(params.generatedContractId);
  if (!contract) throw new Error('Contrato no encontrado');

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SIGNATURE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const sigReq = await SignatureRequest.create({
    _id: `sig_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    generatedContractId: params.generatedContractId,
    chatId: params.chatId,
    clientId: params.clientId,
    accountId: params.accountId,
    signerEmail: params.signerEmail,
    signerName: params.signerName,
    token,
    status: 'sent',
    message: params.message || '',
    originalFilePath: contract.filePath,
    sentAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  // Add file to client's files array
  const client = await Client.findById(params.clientId);
  if (client) {
    const signatureFileEntry = {
      id: `sigfile_${sigReq._id}`,
      name: params.customFileName || contract.fileName,
      date: now.toISOString().split('T')[0],
      filePath: contract.filePath,
      fileSize: 0,
      signatureRequestId: String(sigReq._id),
    };
    client.files.push(signatureFileEntry);
    await client.save();
  }

  // Get account info for the email
  const chat = await ContractChat.findById(params.chatId);
  const accountName = chat?.title || 'Lyrium';

  // Send email
  await sendSignatureEmail({
    to: params.signerEmail,
    signerName: params.signerName,
    contractName: params.customFileName || contract.fileName,
    token,
    message: params.message || '',
    accountName,
  });

  return {
    id: sigReq._id,
    token,
    status: sigReq.status,
    sentAt: sigReq.sentAt,
    expiresAt: sigReq.expiresAt,
  };
}

export async function createSignatureRequestFromUpload(params: {
  clientId: string;
  accountId: string;
  signerEmail: string;
  signerName: string;
  originalFilePath: string;
  fileName: string;
  description?: string;
}): Promise<ISignatureRequestResult> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SIGNATURE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const sigReq = await SignatureRequest.create({
    _id: `sig_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    generatedContractId: '',
    chatId: '',
    clientId: params.clientId,
    accountId: params.accountId,
    signerEmail: params.signerEmail,
    signerName: params.signerName,
    token,
    status: 'sent',
    message: params.description || '',
    originalFilePath: params.originalFilePath,
    sentAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  // Add file to client's files array
  const client = await Client.findById(params.clientId);
  if (client) {
    const signatureFileEntry = {
      id: `sigfile_${sigReq._id}`,
      name: params.fileName,
      date: now.toISOString().split('T')[0],
      filePath: params.originalFilePath,
      fileSize: 0,
      signatureRequestId: String(sigReq._id),
    };
    client.files.push(signatureFileEntry);
    await client.save();
  }

  // Send email
  await sendSignatureEmail({
    to: params.signerEmail,
    signerName: params.signerName,
    contractName: params.fileName,
    token,
    message: params.description || '',
    accountName: 'Lyrium',
  });

  return {
    id: sigReq._id,
    token,
    status: sigReq.status,
    sentAt: sigReq.sentAt,
    expiresAt: sigReq.expiresAt,
  };
}

interface ISignatureRequestResult {
  id: string;
  token: string;
  status: string;
  sentAt: string;
  expiresAt: string;
}

async function sendSignatureEmail(params: {
  to: string;
  signerName: string;
  contractName: string;
  token: string;
  message: string;
  accountName: string;
}) {
  const signUrl = `${FRONTEND_URL}/firmar/${params.token}`;
  const transporter = getSystemTransporter();

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Firma de Documento</h1>
      </div>
      <div style="padding: 32px;">
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
          Hola <strong>${params.signerName}</strong>,
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
          Se le ha enviado el documento <strong>${params.contractName}</strong> para su firma electrónica.
        </p>
        ${params.message ? `<div style="background: #f9fafb; border-left: 4px solid #6366f1; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
          <p style="color: #4b5563; font-size: 14px; line-height: 1.5; margin: 0; font-style: italic;">${params.message}</p>
        </div>` : ''}
        <div style="text-align: center; margin: 32px 0;">
          <a href="${signUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px;">
            Revisar y Firmar Documento
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 13px; text-align: center; margin-top: 24px;">
          Este enlace expira en ${SIGNATURE_EXPIRY_DAYS} días. Si tiene alguna duda, contacte directamente con su despacho.
        </p>
      </div>
      <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">Enviado a través de <strong>Lyrium</strong></p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Lyrium" <${process.env.SYSTEM_EMAIL_USER}>`,
    to: params.to,
    subject: `Documento pendiente de firma: ${params.contractName}`,
    html,
  });
}

export async function getSignatureByToken(token: string) {
  const sigReq = await SignatureRequest.findOne({ token });
  if (!sigReq) return null;

  // Check if expired
  if (new Date(sigReq.expiresAt) < new Date() && sigReq.status !== 'signed') {
    sigReq.status = 'expired';
    await sigReq.save();
    if (sigReq.accountId) {
      dispatchWebhook(sigReq.accountId, 'signature_expired', { signatureRequestId: sigReq._id, clientId: sigReq.clientId, signerEmail: sigReq.signerEmail }).catch(() => {});
    }
  }

  return sigReq;
}

export async function markAsOpened(token: string) {
  const sigReq = await SignatureRequest.findOne({ token });
  if (!sigReq || sigReq.status === 'signed' || sigReq.status === 'expired') return null;

  if (sigReq.status === 'sent') {
    sigReq.status = 'pending';
    sigReq.openedAt = new Date().toISOString();
    await sigReq.save();
  }

  return sigReq;
}

export async function submitSignature(token: string, signatureDataUrl: string, signerIp: string) {
  const sigReq = await SignatureRequest.findOne({ token });
  if (!sigReq) throw new Error('Solicitud no encontrada');
  if (sigReq.status === 'signed') throw new Error('Este documento ya ha sido firmado');
  if (sigReq.status === 'expired' || new Date(sigReq.expiresAt) < new Date()) {
    throw new Error('Este enlace de firma ha expirado');
  }

  // Embed signature into PDF
  const signedFilePath = await embedSignatureInPdf(
    sigReq.originalFilePath,
    signatureDataUrl,
    sigReq.signerName,
    sigReq.signerEmail,
    signerIp
  );

  // Update signature request
  sigReq.status = 'signed';
  sigReq.signedFilePath = signedFilePath;
  sigReq.signatureData = signatureDataUrl.substring(0, 100) + '...'; // Store truncated for audit
  sigReq.signerIp = signerIp;
  sigReq.signedAt = new Date().toISOString();
  await sigReq.save();

  // Update client's file entry with signed path
  const client = await Client.findById(sigReq.clientId);
  if (client) {
    const fileEntry = client.files.find((f: any) => f.signatureRequestId === sigReq._id);
    if (fileEntry) {
      (fileEntry as any).signedFilePath = signedFilePath;
      (fileEntry as any).name = sigReq.signerName ? `${path.basename(sigReq.originalFilePath, '.pdf')}_firmado.pdf` : fileEntry.name;
      await client.save();
    }
  }

  // Send confirmation email to signer (non-blocking — signature is already saved)
  try {
    await sendSignatureConfirmationEmail(sigReq.signerEmail, sigReq.signerName, signedFilePath);
  } catch (emailErr) {
    console.error('Error sending signature confirmation email:', emailErr);
  }

  // Dispatch webhook
  if (sigReq.accountId) {
    dispatchWebhook(sigReq.accountId, 'signature_completed', { signatureRequestId: sigReq._id, clientId: sigReq.clientId, signerEmail: sigReq.signerEmail }).catch(() => {});
  }

  return sigReq;
}

async function embedSignatureInPdf(
  originalPdfPath: string,
  signatureDataUrl: string,
  signerName: string,
  signerEmail: string,
  signerIp: string
): Promise<string> {
  const pdfBytes = await fs.readFile(originalPdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Decode signature image from data URL
  const signatureBase64 = signatureDataUrl.replace(/^data:image\/png;base64,/, '');
  const signatureBytes = Buffer.from(signatureBase64, 'base64');
  const signatureImage = await pdfDoc.embedPng(signatureBytes);

  // Get last page
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width, height } = lastPage.getSize();

  // Calculate signature dimensions (max 200x80, maintain aspect ratio)
  const maxW = 200;
  const maxH = 80;
  const imgDims = signatureImage.scale(1);
  const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
  const sigW = imgDims.width * scale;
  const sigH = imgDims.height * scale;

  // Check if there is enough space on the last page, otherwise add a new page
  const sigBlockHeight = sigH + 60; // signature + text below
  const bottomMargin = 40;

  let targetPage = lastPage;
  let sigY = bottomMargin + 20;

  // If last page does not have enough room at the bottom, add a signature page
  if (sigBlockHeight + bottomMargin > height * 0.3) {
    targetPage = pdfDoc.addPage([width, height]);
    sigY = height - 100;
  }

  // Draw signature image
  targetPage.drawImage(signatureImage, {
    x: 50,
    y: sigY,
    width: sigW,
    height: sigH,
  });

  // Draw signature line
  targetPage.drawLine({
    start: { x: 50, y: sigY - 2 },
    end: { x: 50 + Math.max(sigW, 200), y: sigY - 2 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Draw signer info text
  const fontSize = 8;
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Compute SHA-256 hash of the signature
  const hashBuffer = await crypto.subtle.digest('SHA-256', signatureBytes);
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  targetPage.drawText(`Firmado por: ${signerName} (${signerEmail})`, {
    x: 50,
    y: sigY - 14,
    size: fontSize,
    color: rgb(0.4, 0.4, 0.4),
  });
  targetPage.drawText(`Fecha: ${dateStr} | IP: ${signerIp}`, {
    x: 50,
    y: sigY - 24,
    size: fontSize,
    color: rgb(0.4, 0.4, 0.4),
  });
  targetPage.drawText(`Hash SHA-256: ${hashHex.substring(0, 32)}...`, {
    x: 50,
    y: sigY - 34,
    size: fontSize,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Save signed PDF
  const signedDir = path.join(__dirname, '../../generated_contracts');
  await fs.mkdir(signedDir, { recursive: true });
  const signedFileName = `firmado_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.pdf`;
  const signedPath = path.join(signedDir, signedFileName);
  const signedPdfBytes = await pdfDoc.save();
  await fs.writeFile(signedPath, signedPdfBytes);

  return signedPath;
}

async function sendSignatureConfirmationEmail(email: string, name: string, signedFilePath: string) {
  const transporter = getSystemTransporter();
  const pdfBuffer = await fs.readFile(signedFilePath);

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Documento Firmado</h1>
      </div>
      <div style="padding: 32px;">
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Hola <strong>${name}</strong>,
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Su documento ha sido firmado correctamente. Adjunto encontrará una copia del documento firmado para sus registros.
        </p>
      </div>
      <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">Enviado a través de <strong>Lyrium</strong></p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Lyrium" <${process.env.SYSTEM_EMAIL_USER}>`,
    to: email,
    subject: 'Documento firmado correctamente',
    html,
    attachments: [{
      filename: path.basename(signedFilePath),
      content: pdfBuffer,
    }],
  });
}

export async function resendSignatureEmail(signatureRequestId: string) {
  const sigReq = await SignatureRequest.findById(signatureRequestId);
  if (!sigReq) throw new Error('Solicitud no encontrada');
  if (sigReq.status === 'signed') throw new Error('El documento ya ha sido firmado');

  // Reset expiration
  const now = new Date();
  sigReq.expiresAt = new Date(now.getTime() + SIGNATURE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  sigReq.status = 'sent';
  sigReq.sentAt = now.toISOString();
  await sigReq.save();

  let contractName = 'Documento';
  let accountName = 'Lyrium';

  if (sigReq.generatedContractId) {
    const contract = await GeneratedContract.findById(sigReq.generatedContractId);
    if (contract) contractName = contract.fileName;
    const chat = await ContractChat.findById(sigReq.chatId);
    if (chat) accountName = chat.title || 'Lyrium';
  } else if (sigReq.clientId) {
    const client = await Client.findById(sigReq.clientId);
    const fileEntry = client?.files.find((f: any) => f.signatureRequestId === sigReq._id);
    if (fileEntry) contractName = fileEntry.name;
  }

  await sendSignatureEmail({
    to: sigReq.signerEmail,
    signerName: sigReq.signerName,
    contractName,
    token: sigReq.token,
    message: sigReq.message || '',
    accountName,
  });

  return sigReq;
}

export async function getSignatureRequestsForChat(chatId: string) {
  return SignatureRequest.find({ chatId }).sort({ sentAt: -1 });
}

export async function getSignatureRequestsForClient(clientId: string) {
  return SignatureRequest.find({ clientId }).sort({ sentAt: -1 });
}

export async function getSignatureRequestById(id: string) {
  return SignatureRequest.findById(id);
}
