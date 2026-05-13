import mongoose, { Schema } from 'mongoose';

export interface IClientReminder {
  _id: string;
  clientId: string;
  clientName: string;
  accountId: string;
  title: string;
  dateFrom: string;
  dateTo?: string;
  type: string;
  notes?: string;
  createdAt: string;
}

const clientReminderSchema = new Schema<IClientReminder>({
  _id: { type: String, required: true },
  clientId: { type: String, required: true, index: true },
  clientName: { type: String, default: '' },
  accountId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  dateFrom: { type: String, required: true },
  dateTo: { type: String, default: '' },
  type: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

clientReminderSchema.index({ accountId: 1, dateFrom: 1 });

clientReminderSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const ClientReminder = mongoose.model<IClientReminder>('ClientReminder', clientReminderSchema);
