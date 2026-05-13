import crypto from 'crypto';
import mongoose, { Schema } from 'mongoose';

export interface IInvoiceLine {
  id: string;
  concept: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface IInvoice {
  _id: string;
  clientId: string;
  accountId: string;
  invoiceNumber: string;
  publicId: string;
  date: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmNIF: string;
  firmInfo: string;
  paymentMethod: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  taxRate: number;
  lines: IInvoiceLine[];
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  sentAt: string;
  sentFrom: string;
  // VeriFactu
  huella: string;
  huellaAnterior: string;
  verifactuTimestamp: string;
  paymentStatus?: 'pending' | 'paid' | 'unpaid';
}

export interface IInvoiceSettings {
  _id: string;
  accountId: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmNIF: string;
  firmInfo: string;
  fiscalTerritory: string;
  paymentMethod: string;
  defaultTaxRate: number;
  nextInvoiceNumber: number;
}

const invoiceLineSchema = new Schema({
  id: String,
  concept: String,
  quantity: { type: Number, default: 1 },
  price: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
}, { _id: false });

export const generateInvoicePublicId = (): string => crypto.randomBytes(16).toString('hex');

const invoiceSchema = new Schema<IInvoice>({
  _id: { type: String, required: true },
  clientId: { type: String, required: true, index: true },
  accountId: { type: String, required: true },
  invoiceNumber: { type: String, required: true },
  publicId: { type: String, default: generateInvoicePublicId },
  date: { type: String, required: true },
  firmName: { type: String, default: '' },
  firmAddress: { type: String, default: '' },
  firmPhone: { type: String, default: '' },
  firmNIF: { type: String, default: '' },
  firmInfo: { type: String, default: '' },
  paymentMethod: { type: String, default: '' },
  clientName: { type: String, default: '' },
  clientEmail: { type: String, default: '' },
  clientPhone: { type: String, default: '' },
  taxRate: { type: Number, default: 21 },
  lines: { type: [invoiceLineSchema], default: [] },
  baseAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  sentAt: { type: String, default: '' },
  sentFrom: { type: String, default: '' },
  huella: { type: String, default: '' },
  huellaAnterior: { type: String, default: '' },
  verifactuTimestamp: { type: String, default: '' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'unpaid'], default: 'pending' },
}, { _id: false, versionKey: false });

invoiceSchema.pre('validate', function () {
  if (!this.publicId) {
    this.publicId = generateInvoicePublicId();
  }
});

invoiceSchema.index({ publicId: 1 }, { unique: true, sparse: true });
invoiceSchema.index({ accountId: 1, invoiceNumber: 1 }, { unique: true });

invoiceSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

const invoiceSettingsSchema = new Schema<IInvoiceSettings>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, unique: true },
  firmName: { type: String, default: '' },
  firmAddress: { type: String, default: '' },
  firmPhone: { type: String, default: '' },
  firmNIF: { type: String, default: '' },
  firmInfo: { type: String, default: '' },
  fiscalTerritory: { type: String, default: 'comun' },
  paymentMethod: { type: String, default: '' },
  defaultTaxRate: { type: Number, default: 21 },
  nextInvoiceNumber: { type: Number, default: 1 },
}, { _id: false, versionKey: false });

invoiceSettingsSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
export const InvoiceSettings = mongoose.model<IInvoiceSettings>('InvoiceSettings', invoiceSettingsSchema);
