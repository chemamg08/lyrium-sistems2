import mongoose, { Schema } from 'mongoose';

export interface IUploadedFile {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
  extractedText: string;
  summary: string;
  size: number;
}

export interface IDocSummaryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
}

export interface IDocumentSummariesChat {
  _id: string;
  accountId: string;
  createdBy: string;
  title: string;
  date: string;
  uploadedFiles: IUploadedFile[];
  messages: IDocSummaryMessage[];
  lastModified: string;
  chatSummary?: string;
}

const uploadedFileSchema = new Schema({
  id: String,
  originalName: String,
  fileName: String,
  filePath: String,
  uploadedAt: String,
  extractedText: String,
  summary: String,
  size: Number,
}, { _id: false });

const docSummaryMessageSchema = new Schema({
  id: String,
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  metadata: Schema.Types.Mixed,
}, { _id: false });

const documentSummariesChatSchema = new Schema<IDocumentSummariesChat>({
  _id: { type: String, required: true },
  accountId: { type: String, default: '', index: true },
  createdBy: { type: String, default: '' },
  title: { type: String, required: true },
  date: { type: String, required: true },
  uploadedFiles: { type: [uploadedFileSchema], default: [] },
  messages: { type: [docSummaryMessageSchema], default: [] },
  lastModified: { type: String, default: () => new Date().toISOString() },
  chatSummary: { type: String, default: null },
}, { _id: false, versionKey: false });

documentSummariesChatSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const DocumentSummariesChat = mongoose.model<IDocumentSummariesChat>('DocumentSummariesChat', documentSummariesChatSchema);
