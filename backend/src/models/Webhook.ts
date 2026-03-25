import mongoose, { Schema } from 'mongoose';
import crypto from 'crypto';

export interface IWebhook {
  _id: string;
  accountId: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  description: string;
  createdAt: string;
  lastTriggeredAt: string;
}

export const WEBHOOK_EVENTS = [
  'new_client',
  'client_updated',
  'client_deleted',
  'contract_generated',
  'signature_completed',
  'signature_expired',
  'calendar_event_created',
  'calendar_event_updated',
  'calendar_event_deleted',
  'file_uploaded',
  'file_deleted',
  'invoice_created',
  'invoice_updated',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

const webhookSchema = new Schema<IWebhook>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  url: { type: String, required: true },
  events: [{ type: String, enum: WEBHOOK_EVENTS }],
  secret: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  description: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  lastTriggeredAt: { type: String, default: '' },
}, { _id: false, versionKey: false });

webhookSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

export const Webhook = mongoose.model<IWebhook>('Webhook', webhookSchema);
