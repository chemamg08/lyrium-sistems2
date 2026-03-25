import mongoose, { Schema } from 'mongoose';

export interface IWritingText {
  _id: string;
  accountId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const writingTextSchema = new Schema<IWritingText>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  content: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

writingTextSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const WritingText = mongoose.model<IWritingText>('WritingText', writingTextSchema);
