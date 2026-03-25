import mongoose, { Schema } from 'mongoose';

export interface IContract {
  _id: string;
  name: string;
  summary: string;
  fileName: string;
  filePath: string;
  accountId: string;
}

const contractSchema = new Schema<IContract>({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  summary: { type: String, default: '' },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  accountId: { type: String, default: '', index: true },
}, { _id: false, versionKey: false });

contractSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Contract = mongoose.model<IContract>('Contract', contractSchema);
