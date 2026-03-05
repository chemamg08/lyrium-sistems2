import mongoose, { Schema } from 'mongoose';

export interface ICalculationDesglose {
  concepto: string;
  valor: number;
}

export interface ICalculation {
  _id: string;
  clientId: string;
  clientName: string;
  clientType: string;
  label: string;
  createdAt: string;
  data: any;
  resultado: number;
  etiquetaTotal: string;
  desglose: ICalculationDesglose[];
  accountId: string;
}

const desgloseSchema = new Schema({
  concepto: String,
  valor: Number,
}, { _id: false });

const calculationSchema = new Schema<ICalculation>({
  _id: { type: String, required: true },
  clientId: { type: String, required: true },
  clientName: { type: String, default: '' },
  clientType: { type: String, default: '' },
  label: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  data: { type: Schema.Types.Mixed, default: {} },
  resultado: { type: Number, default: 0 },
  etiquetaTotal: { type: String, default: '' },
  desglose: { type: [desgloseSchema], default: [] },
  accountId: { type: String, default: '' },
}, { _id: false, versionKey: false });

calculationSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Calculation = mongoose.model<ICalculation>('Calculation', calculationSchema);
