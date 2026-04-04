import mongoose, { Schema } from 'mongoose';

export interface IFiscalMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface IFiscalChat {
  _id: string;
  clientId: string;
  accountId: string;
  createdBy: string;
  title: string;
  messages: IFiscalMessage[];
  createdAt: string;
  updatedAt: string;
  summary?: string;
}

const fiscalMessageSchema = new Schema({
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  timestamp: String,
}, { _id: false });

const fiscalChatSchema = new Schema<IFiscalChat>({
  _id: { type: String, required: true },
  clientId: { type: String, default: 'general' },
  accountId: { type: String, required: true, index: true },
  createdBy: { type: String, default: '' },
  title: { type: String, default: '' },
  messages: { type: [fiscalMessageSchema], default: [] },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
  summary: { type: String, default: null },
}, { _id: false, versionKey: false });

fiscalChatSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const FiscalChat = mongoose.model<IFiscalChat>('FiscalChat', fiscalChatSchema);
