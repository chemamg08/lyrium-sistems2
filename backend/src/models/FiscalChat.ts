import mongoose, { Schema } from 'mongoose';

export interface IFlag {
  id: string;
  createdAt: string;
}

export interface IFiscalMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  flags?: IFlag[];
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

const flagSchema = new Schema({
  id: String,
  createdAt: String,
}, { _id: false });

const fiscalMessageSchema = new Schema({
  id: String,
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  timestamp: String,
  flags: { type: [flagSchema], default: [] },
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
