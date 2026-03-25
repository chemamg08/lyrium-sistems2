import mongoose, { Schema } from 'mongoose';

export interface IAccount {
  _id: string;
  name: string;
  email: string;
  password: string;
  country: string;
  type: string;
  role?: string;
  createdAt: string;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  googleCalendarConnected?: boolean;
  calendarOAuthState?: string | null;
  calendarOAuthStateExpires?: string | null;
  twoFactorSecret?: string | null;
  twoFactorEnabled?: boolean;
  recoveryCodes?: string[];
  emailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: string | null;
  resetPasswordToken?: string | null;
  resetPasswordExpires?: string | null;
  failedLoginAttempts?: number;
  lockUntil?: string | null;
  disabled?: boolean;
}

const accountSchema = new Schema<IAccount>({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  country: { type: String, default: 'ES' },
  type: { type: String, default: 'main' },
  role: { type: String, default: 'user' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  googleAccessToken: { type: String, default: null },
  googleRefreshToken: { type: String, default: null },
  googleCalendarConnected: { type: Boolean, default: false },
  calendarOAuthState: { type: String, default: null },
  calendarOAuthStateExpires: { type: String, default: null },
  twoFactorSecret: { type: String, default: null },
  twoFactorEnabled: { type: Boolean, default: false },
  recoveryCodes: { type: [String], default: [] },
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String, default: null },
  emailVerificationExpires: { type: String, default: null },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: String, default: null },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: String, default: null },
  disabled: { type: Boolean, default: false },
}, { _id: false, versionKey: false });

accountSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Account = mongoose.model<IAccount>('Account', accountSchema);
