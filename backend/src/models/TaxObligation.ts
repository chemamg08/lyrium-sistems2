import mongoose, { Schema } from 'mongoose';

export type TaxObligationStatus = 'draft' | 'calculated' | 'filed' | 'paid' | 'overdue' | 'error';

export interface ITaxObligationBreakdownLine {
  concepto: string;
  valor: number;
  isSection?: boolean;
}

export interface ITaxObligation {
  _id: string;
  accountId: string;
  clientId: string;
  clientName: string;
  clientType: string;
  countryCode: string;
  currency: string;
  modelCode: string;
  modelName: string;
  period: string;
  periodType: 'monthly' | 'quarterly' | 'yearly' | 'custom';
  calculationId: string;
  calculationLabel: string;
  baseAmount: number;
  deductibleAmount: number;
  taxDue: number;
  etiquetaTotal: string;
  desglose: ITaxObligationBreakdownLine[];
  externalSources: string[];
  metadata: Record<string, any>;
  portalUrl: string;
  deadline: string;
  filedAt: string;
  paidAt: string;
  paymentReference: string;
  notes: string;
  status: TaxObligationStatus;
  createdAt: string;
  updatedAt: string;
}

const breakdownLineSchema = new Schema(
  {
    concepto: { type: String, default: '' },
    valor: { type: Number, default: 0 },
    isSection: { type: Boolean, default: false },
  },
  { _id: false }
);

const taxObligationSchema = new Schema<ITaxObligation>(
  {
    _id: { type: String, required: true },
    accountId: { type: String, required: true, index: true },
    clientId: { type: String, required: true, index: true },
    clientName: { type: String, default: '' },
    clientType: { type: String, default: '' },
    countryCode: { type: String, default: 'ES', uppercase: true },
    currency: { type: String, default: 'EUR' },
    modelCode: { type: String, required: true },
    modelName: { type: String, required: true },
    period: { type: String, required: true },
    periodType: { type: String, default: 'quarterly' },
    calculationId: { type: String, default: '' },
    calculationLabel: { type: String, default: '' },
    baseAmount: { type: Number, default: 0 },
    deductibleAmount: { type: Number, default: 0 },
    taxDue: { type: Number, default: 0 },
    etiquetaTotal: { type: String, default: '' },
    desglose: { type: [breakdownLineSchema], default: [] },
    externalSources: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    portalUrl: { type: String, default: '' },
    deadline: { type: String, default: '' },
    filedAt: { type: String, default: '' },
    paidAt: { type: String, default: '' },
    paymentReference: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: { type: String, default: 'calculated', index: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false, versionKey: false }
);

taxObligationSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

export const TaxObligation = mongoose.model<ITaxObligation>('TaxObligation', taxObligationSchema);
