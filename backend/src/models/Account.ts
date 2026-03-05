import mongoose, { Schema } from 'mongoose';

export interface IAccount {
  _id: string;
  name: string;
  email: string;
  password: string;
  country: string;
  type: string;
  createdAt: string;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  googleCalendarConnected?: boolean;
}

const accountSchema = new Schema<IAccount>({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  country: { type: String, default: 'ES' },
  type: { type: String, default: 'main' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  googleAccessToken: { type: String, default: null },
  googleRefreshToken: { type: String, default: null },
  googleCalendarConnected: { type: Boolean, default: false },
}, { _id: false, versionKey: false });

accountSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Account = mongoose.model<IAccount>('Account', accountSchema);
