import mongoose, { Schema } from 'mongoose';

export interface ISharedFile {
  _id: string;
  filename: string;
  originalName: string;
  senderId: string;
  senderName: string;
  recipientIds: string[];
  size: number;
  uploadedAt: string;
}

const sharedFileSchema = new Schema<ISharedFile>({
  _id: { type: String, required: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  senderId: { type: String, required: true },
  senderName: { type: String, default: '' },
  recipientIds: { type: [String], default: [] },
  size: { type: Number, default: 0 },
  uploadedAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

sharedFileSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const SharedFile = mongoose.model<ISharedFile>('SharedFile', sharedFileSchema);
