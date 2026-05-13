import mongoose, { Schema } from 'mongoose';

export interface IDailyIaUsage {
  accountId: string;
  date: string; // YYYY-MM-DD
  count: number;
}

const dailyIaUsageSchema = new Schema<IDailyIaUsage>({
  accountId: { type: String, required: true, index: true },
  date: { type: String, required: true },
  count: { type: Number, default: 0 },
}, { _id: false, versionKey: false });

dailyIaUsageSchema.index({ accountId: 1, date: 1 }, { unique: true });

export const DailyIaUsage = mongoose.model<IDailyIaUsage>('DailyIaUsage', dailyIaUsageSchema);
