import mongoose, { Schema } from 'mongoose';

export interface IDistributedLock {
  _id: string;
  ownerId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

const distributedLockSchema = new Schema<IDistributedLock>({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true, index: true },
  expiresAt: { type: String, required: true, index: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

export const DistributedLock = mongoose.model<IDistributedLock>('DistributedLock', distributedLockSchema);