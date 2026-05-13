import mongoose, { Schema } from 'mongoose';

export interface IFlag {
  id: string;
  createdAt: string;
}

export interface IAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  flags?: IFlag[];
}

export interface IAssistantChat {
  _id: string;
  accountId: string;
  createdBy: string;
  name: string;
  createdAt: string;
  messages: IAssistantMessage[];
  summary?: string;
}

const flagSchema = new Schema({
  id: String,
  createdAt: String,
}, { _id: false });

const assistantMessageSchema = new Schema({
  id: String,
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  flags: { type: [flagSchema], default: [] },
}, { _id: false });

const assistantChatSchema = new Schema<IAssistantChat>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  createdBy: { type: String, default: '' },
  name: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  messages: { type: [assistantMessageSchema], default: [] },
  summary: { type: String, default: null },
}, { _id: false, versionKey: false });

assistantChatSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const AssistantChat = mongoose.model<IAssistantChat>('AssistantChat', assistantChatSchema);
