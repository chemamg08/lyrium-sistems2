import mongoose, { Schema } from 'mongoose';

export interface IGeneratedContract {
  _id: string;
  chatId: string;
  contractBaseId: string;
  fileName: string;
  filePath: string;
  variables: any;
  createdAt: string;
}

const generatedContractSchema = new Schema<IGeneratedContract>({
  _id: { type: String, required: true },
  chatId: { type: String, required: true },
  contractBaseId: { type: String, default: '' },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  variables: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

generatedContractSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const GeneratedContract = mongoose.model<IGeneratedContract>('GeneratedContract', generatedContractSchema);
