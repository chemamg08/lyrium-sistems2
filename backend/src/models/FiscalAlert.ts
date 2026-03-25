import mongoose, { Schema } from 'mongoose';

export interface IAlertRecipient {
  clientId: string;
  clientName: string;
  email: string;
}

export interface IFiscalAlert {
  _id: string;
  asunto: string;
  mensaje: string;
  destinatarios: IAlertRecipient[];
  fechaEnvio: string;
  repeticion: string;
  estado: string;
  accountId: string;
  createdAt: string;
  updatedAt: string;
}

const alertRecipientSchema = new Schema({
  clientId: String,
  clientName: String,
  email: String,
}, { _id: false });

const fiscalAlertSchema = new Schema<IFiscalAlert>({
  _id: { type: String, required: true },
  asunto: { type: String, required: true },
  mensaje: { type: String, required: true },
  destinatarios: { type: [alertRecipientSchema], default: [] },
  fechaEnvio: { type: String, required: true },
  repeticion: { type: String, default: 'una vez' },
  estado: { type: String, default: 'pendiente' },
  accountId: { type: String, required: true, index: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

fiscalAlertSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const FiscalAlert = mongoose.model<IFiscalAlert>('FiscalAlert', fiscalAlertSchema);
