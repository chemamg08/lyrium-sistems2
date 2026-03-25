import mongoose, { Schema } from 'mongoose';
import crypto from 'crypto';

export interface IApiKey {
  _id: string;
  accountId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string;
}

const apiKeySchema = new Schema<IApiKey>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  keyHash: { type: String, required: true, unique: true },
  keyPrefix: { type: String, required: true },
  permissions: [{ type: String }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  lastUsedAt: { type: String, default: '' },
}, { _id: false, versionKey: false });

apiKeySchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.keyHash;
    return ret;
  }
});

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `lyr_${crypto.randomBytes(32).toString('hex')}`;
  const hash = hashApiKey(raw);
  const prefix = raw.substring(0, 8);
  return { raw, hash, prefix };
}

export const ApiKey = mongoose.model<IApiKey>('ApiKey', apiKeySchema);
