import mongoose, { Schema } from 'mongoose';

export interface IContractChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
}

export interface IContractChat {
  _id: string;
  contractBaseId: string;
  accountId: string;
  createdBy: string;
  title: string;
  date: string;
  messages: IContractChatMessage[];
  lastModified: string;
  firstMessagePreview: string;
  hasGeneratedContract: boolean;
  temporaryContractFile?: {
    fileName: string;
    filePath: string;
    analyzedStructure?: any;
  };
  isTemporary: boolean;
  summary?: string;
}

const contractChatMessageSchema = new Schema({
  id: String,
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  metadata: Schema.Types.Mixed,
}, { _id: false });

const contractChatSchema = new Schema<IContractChat>({
  _id: { type: String, required: true },
  contractBaseId: { type: String, default: '' },
  accountId: { type: String, default: '', index: true },
  createdBy: { type: String, default: '' },
  title: { type: String, required: true },
  date: { type: String, required: true },
  messages: { type: [contractChatMessageSchema], default: [] },
  lastModified: { type: String, default: '' },
  firstMessagePreview: { type: String, default: '' },
  hasGeneratedContract: { type: Boolean, default: false },
  temporaryContractFile: { type: Schema.Types.Mixed, default: undefined },
  isTemporary: { type: Boolean, default: false },
  summary: { type: String, default: null },
}, { _id: false, versionKey: false });

contractChatSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const ContractChat = mongoose.model<IContractChat>('ContractChat', contractChatSchema);
