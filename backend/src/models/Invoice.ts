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
  date: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
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
}

export interface IInvoiceSettings {
  _id: string;
  accountId: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
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

const invoiceSchema = new Schema<IInvoice>({
  _id: { type: String, required: true },
  clientId: { type: String, required: true, index: true },
  accountId: { type: String, required: true },
  invoiceNumber: { type: String, required: true },
  date: { type: String, required: true },
  firmName: { type: String, default: '' },
  firmAddress: { type: String, default: '' },
  firmPhone: { type: String, default: '' },
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
}, { _id: false, versionKey: false });

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
