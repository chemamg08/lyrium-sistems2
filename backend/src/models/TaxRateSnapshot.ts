import mongoose, { Schema } from 'mongoose';

export type TaxRateSyncStatus = 'ok' | 'warning' | 'error';

export interface ITaxRateSnapshot {
  _id: string;
  countryCode: string;
  vatRate: number;
  incomeTaxRate: number;
  corporateTaxRate: number;
  exchangeRateEurUsd: number;
  sources: string[];
  syncStatus: TaxRateSyncStatus;
  syncError: string;
  lastSyncedAt: string;
  nextSyncAt: string;
  createdAt: string;
  updatedAt: string;
}

const taxRateSnapshotSchema = new Schema<ITaxRateSnapshot>(
  {
    _id: { type: String, required: true },
    countryCode: { type: String, required: true, uppercase: true, index: true },
    vatRate: { type: Number, default: 0 },
    incomeTaxRate: { type: Number, default: 0 },
    corporateTaxRate: { type: Number, default: 0 },
    exchangeRateEurUsd: { type: Number, default: 1 },
    sources: { type: [String], default: [] },
    syncStatus: { type: String, default: 'ok' },
    syncError: { type: String, default: '' },
    lastSyncedAt: { type: String, default: () => new Date().toISOString(), index: true },
    nextSyncAt: { type: String, default: '' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false, versionKey: false }
);

taxRateSnapshotSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

taxRateSnapshotSchema.index({ countryCode: 1, lastSyncedAt: -1 });

export const TaxRateSnapshot = mongoose.model<ITaxRateSnapshot>('TaxRateSnapshot', taxRateSnapshotSchema);
