import mongoose, { Schema } from 'mongoose';

export interface ISubscription {
  _id: string;
  accountId: string;
  plan: string;
  interval: string;
  status: string;
  trialEndDate: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePaymentMethodId: string | null;
  paymentMethod: { brand: string; last4: string } | null;
  juniorDiscount: {
    enabled: boolean;
    proofUrl: string | null;
    status: 'pending' | 'verified' | 'rejected' | 'expired';
    appliedAt: string | null;
    verifiedAt: string | null;
    verifiedBy: string | null;
    originalPrice: number;
    finalPrice: number;
  } | null;
  promoCode: string | null;
  promoCodeAppliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const subscriptionSchema = new Schema<ISubscription>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  plan: { type: String, required: true },
  interval: { type: String, required: true },
  status: { type: String, required: true },
  trialEndDate: { type: String, default: null },
  currentPeriodStart: { type: String, required: true },
  currentPeriodEnd: { type: String, required: true },
  autoRenew: { type: Boolean, default: false },
  stripeCustomerId: { type: String, default: null },
  stripeSubscriptionId: { type: String, default: null },
  stripePaymentMethodId: { type: String, default: null },
  paymentMethod: { type: Schema.Types.Mixed, default: null },
  juniorDiscount: {
    type: {
      enabled: { type: Boolean, default: false },
      proofUrl: { type: String, default: null },
      status: { type: String, enum: ['pending', 'verified', 'rejected', 'expired'], default: 'pending' },
      appliedAt: { type: String, default: null },
      verifiedAt: { type: String, default: null },
      verifiedBy: { type: String, default: null },
      originalPrice: { type: Number, default: 0 },
      finalPrice: { type: Number, default: 0 },
    },
    default: null,
  },
  promoCode: { type: String, default: null },
  promoCodeAppliedAt: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

subscriptionSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
