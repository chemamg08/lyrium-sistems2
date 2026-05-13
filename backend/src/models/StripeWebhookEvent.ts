import mongoose, { Schema } from 'mongoose';

export type StripeWebhookEventStatus = 'processing' | 'processed' | 'ignored' | 'failed';

export interface IStripeWebhookEvent {
  _id: string;
  type: string;
  status: StripeWebhookEventStatus;
  attempts: number;
  accountId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  objectId?: string | null;
  stripeCreatedAt?: string | null;
  processingStartedAt?: string | null;
  processedAt?: string | null;
  ignoredReason?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

const stripeWebhookEventSchema = new Schema<IStripeWebhookEvent>({
  _id: { type: String, required: true },
  type: { type: String, required: true, index: true },
  status: { type: String, enum: ['processing', 'processed', 'ignored', 'failed'], required: true, index: true },
  attempts: { type: Number, default: 1 },
  accountId: { type: String, default: null, index: true },
  stripeCustomerId: { type: String, default: null, index: true },
  stripeSubscriptionId: { type: String, default: null, index: true },
  objectId: { type: String, default: null },
  stripeCreatedAt: { type: String, default: null, index: true },
  processingStartedAt: { type: String, default: null },
  processedAt: { type: String, default: null },
  ignoredReason: { type: String, default: null },
  lastError: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

stripeWebhookEventSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const StripeWebhookEvent = mongoose.model<IStripeWebhookEvent>('StripeWebhookEvent', stripeWebhookEventSchema);