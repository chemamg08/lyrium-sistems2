import mongoose, { Schema } from 'mongoose';

export interface IClientFile {
  id: string;
  name: string;
  date: string;
  filePath: string;
  extractedText?: string;
}

export interface IClient {
  _id: string;
  name: string;
  email: string;
  phone: string;
  cases: number;
  status: string;
  summary: string;
  files: IClientFile[];
  accountId: string;
  clientType: string;
  fiscalInfo: any;
  autoCreated: boolean;
  assignedSubaccountId: string;
}

const clientFileSchema = new Schema({
  id: String,
  name: String,
  date: String,
  filePath: String,
  extractedText: String,
}, { _id: false });

const clientSchema = new Schema<IClient>({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  cases: { type: Number, default: 0 },
  status: { type: String, default: 'abierto' },
  summary: { type: String, default: '' },
  files: { type: [clientFileSchema], default: [] },
  accountId: { type: String, required: true },
  clientType: { type: String, default: 'particular' },
  fiscalInfo: { type: Schema.Types.Mixed, default: {} },
  autoCreated: { type: Boolean, default: false },
  assignedSubaccountId: { type: String, default: null },
}, { _id: false, versionKey: false });

clientSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Client = mongoose.model<IClient>('Client', clientSchema);
