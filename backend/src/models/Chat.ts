import mongoose, { Schema } from 'mongoose';

export interface IMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface IChat {
  _id: string;
  clientId: string;
  title: string;
  date: string;
  source: string;
  createdBy: string;
  messages: IMessage[];
}

const messageSchema = new Schema({
  id: String,
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  timestamp: String,
}, { _id: false });

const chatSchema = new Schema<IChat>({
  _id: { type: String, required: true },
  clientId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  date: { type: String, required: true },
  source: { type: String, default: 'client' },
  createdBy: { type: String, default: '' },
  messages: { type: [messageSchema], default: [] },
}, { _id: false, versionKey: false });

chatSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Chat = mongoose.model<IChat>('Chat', chatSchema);
