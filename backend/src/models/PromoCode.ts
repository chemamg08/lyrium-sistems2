import mongoose, { Schema } from 'mongoose';

export interface IPromoCode {
  _id: string;
  code: string;
  type: 'percentage_discount' | 'free_months';
  value: number;
  durationMonths: number;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const promoCodeSchema = new Schema<IPromoCode>({
  _id: { type: String, required: true },
  code: { type: String, required: true, unique: true, index: true },
  type: { type: String, enum: ['percentage_discount', 'free_months'], required: true },
  value: { type: Number, required: true },
  durationMonths: { type: Number, required: true, default: 1 },
  maxUses: { type: Number, default: null },
  usedCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  expiresAt: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

promoCodeSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const PromoCode = mongoose.model<IPromoCode>('PromoCode', promoCodeSchema);
