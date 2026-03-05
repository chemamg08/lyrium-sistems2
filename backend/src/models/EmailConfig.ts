import mongoose, { Schema } from 'mongoose';

export interface IEmailConfig {
  _id: string;
  accountId: string;
  platform: string;
  smtpServer: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
}

const emailConfigSchema = new Schema<IEmailConfig>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, unique: true },
  platform: { type: String, default: 'gmail' },
  smtpServer: { type: String, default: 'smtp.gmail.com' },
  smtpPort: { type: Number, default: 587 },
  smtpUser: { type: String, required: true },
  smtpPassword: { type: String, required: true },
}, { _id: false, versionKey: false });

emailConfigSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const EmailConfig = mongoose.model<IEmailConfig>('EmailConfig', emailConfigSchema);
