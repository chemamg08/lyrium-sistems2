import mongoose, { Schema } from 'mongoose';

export interface ISubaccount {
  _id: string;
  name: string;
  email: string;
  password: string;
  type: string;
  parentAccountId: string;
  createdAt: string;
}

const subaccountSchema = new Schema<ISubaccount>({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  type: { type: String, default: 'subaccount' },
  parentAccountId: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

subaccountSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Subaccount = mongoose.model<ISubaccount>('Subaccount', subaccountSchema);
