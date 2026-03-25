import mongoose, { Schema } from 'mongoose';

export interface IImproveAIFolder {
  _id: string;
  accountId: string;
  name: string;
  parentFolder: string | null;
  createdAt: string;
}

export interface IImproveAIFile {
  _id: string;
  accountId: string;
  folderId: string | null;
  originalName: string;
  storagePath: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  processed: boolean;
  fragmentCount: number;
}

export interface IImproveAIFragment {
  _id: string;
  accountId: string;
  fileId: string;
  fileName: string;
  folderId: string | null;
  text: string;
  embedding: number[];
  index: number;
}

const folderSchema = new Schema({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  parentFolder: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, {
  toJSON: {
    transform: (_doc: any, ret: any) => { ret.id = ret._id; delete ret.__v; return ret; }
  }
});

const fileSchema = new Schema({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  folderId: { type: String, default: null },
  originalName: { type: String, required: true },
  storagePath: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: String, default: () => new Date().toISOString() },
  uploadedBy: { type: String, required: true },
  processed: { type: Boolean, default: false },
  fragmentCount: { type: Number, default: 0 },
}, {
  toJSON: {
    transform: (_doc: any, ret: any) => { ret.id = ret._id; delete ret.__v; return ret; }
  }
});

const fragmentSchema = new Schema({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  fileId: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  folderId: { type: String, default: null },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
  index: { type: Number, required: true },
}, {
  toJSON: {
    transform: (_doc: any, ret: any) => { ret.id = ret._id; delete ret.__v; return ret; }
  }
});

export const ImproveAIFolder = mongoose.model<IImproveAIFolder>('ImproveAIFolder', folderSchema);
export const ImproveAIFile = mongoose.model<IImproveAIFile>('ImproveAIFile', fileSchema);
export const ImproveAIFragment = mongoose.model<IImproveAIFragment>('ImproveAIFragment', fragmentSchema);
