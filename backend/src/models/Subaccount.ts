import mongoose, { Schema } from 'mongoose';

export interface ISubaccount {
  _id: string;
  name: string;
  email: string;
  password: string;
  type: string;
  parentAccountId: string;
  createdAt: string;
  twoFactorSecret?: string | null;
  twoFactorEnabled?: boolean;
  recoveryCodes?: string[];
  resetPasswordToken?: string | null;
  resetPasswordExpires?: string | null;
  failedLoginAttempts?: number;
  lockUntil?: string | null;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  googleCalendarConnected?: boolean;
  calendarOAuthState?: string | null;
  calendarOAuthStateExpires?: string | null;
}

const subaccountSchema = new Schema<ISubaccount>({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  type: { type: String, default: 'subaccount' },
  parentAccountId: { type: String, required: true, index: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  twoFactorSecret: { type: String, default: null },
  twoFactorEnabled: { type: Boolean, default: false },
  recoveryCodes: { type: [String], default: [] },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: String, default: null },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: String, default: null },
  googleAccessToken: { type: String, default: null },
  googleRefreshToken: { type: String, default: null },
  googleCalendarConnected: { type: Boolean, default: false },
  calendarOAuthState: { type: String, default: null },
  calendarOAuthStateExpires: { type: String, default: null },
}, { _id: false, versionKey: false });

subaccountSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Subaccount = mongoose.model<ISubaccount>('Subaccount', subaccountSchema);
