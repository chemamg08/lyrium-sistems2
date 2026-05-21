import mongoose, { Schema } from 'mongoose';

export interface ISignatureRequest {
  _id: string;
  generatedContractId: string;
  chatId: string;
  clientId: string;
  accountId: string;
  signerEmail: string;
  signerName: string;
  token: string;
  status: 'sent' | 'pending' | 'signed' | 'expired';
  message?: string;
  originalFilePath: string;
  signedFilePath?: string;
  signatureData?: string;
  signatureDataFull?: string;
  signerIp?: string;
  signerUserAgent?: string;
  documentHashOriginal?: string;
  documentHashSigned?: string;
  consentAcceptedAt?: string;
  consentTextVersion?: string;
  auditTrail?: Array<{
    type: string;
    timestamp: string;
    ip?: string;
    userAgent?: string;
    details?: string;
  }>;
  sentAt: string;
  openedAt?: string;
  signedAt?: string;
  expiresAt: string;
}

const signatureRequestSchema = new Schema<ISignatureRequest>({
  _id: { type: String, required: true },
  generatedContractId: { type: String, default: '', index: true },
  chatId: { type: String, default: '' },
  clientId: { type: String, required: true, index: true },
  accountId: { type: String, required: true, index: true },
  signerEmail: { type: String, required: true },
  signerName: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  status: { type: String, enum: ['sent', 'pending', 'signed', 'expired'], default: 'sent' },
  message: { type: String, default: '' },
  originalFilePath: { type: String, required: true },
  signedFilePath: { type: String, default: '' },
  signatureData: { type: String, default: '' },
  signatureDataFull: { type: String, default: '' },
  signerIp: { type: String, default: '' },
  signerUserAgent: { type: String, default: '' },
  documentHashOriginal: { type: String, default: '' },
  documentHashSigned: { type: String, default: '' },
  consentAcceptedAt: { type: String, default: '' },
  consentTextVersion: { type: String, default: '' },
  auditTrail: { type: [{
    type: { type: String, required: true },
    timestamp: { type: String, required: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    details: { type: String, default: '' },
  }], default: [] },
  sentAt: { type: String, default: () => new Date().toISOString() },
  openedAt: { type: String, default: '' },
  signedAt: { type: String, default: '' },
  expiresAt: { type: String, required: true },
}, { _id: false, versionKey: false });

signatureRequestSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const SignatureRequest = mongoose.model<ISignatureRequest>('SignatureRequest', signatureRequestSchema);
