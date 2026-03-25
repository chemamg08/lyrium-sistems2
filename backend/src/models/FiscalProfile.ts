import mongoose, { Schema } from 'mongoose';

export interface IFiscalProfile {
  _id: string;
  clientId: string;
  accountId: string;
  tipoActividad: string;
  ingresosAnuales: number;
  situacionFamiliar: string;
  hijos: number;
  inmuebles: string;
  inversiones: string;
  deducciones: string;
  notas: string;
  createdAt: string;
  updatedAt: string;
}

const fiscalProfileSchema = new Schema<IFiscalProfile>({
  _id: { type: String, required: true },
  clientId: { type: String, required: true, index: true },
  accountId: { type: String, required: true },
  tipoActividad: { type: String, default: '' },
  ingresosAnuales: { type: Number, default: 0 },
  situacionFamiliar: { type: String, default: '' },
  hijos: { type: Number, default: 0 },
  inmuebles: { type: String, default: '' },
  inversiones: { type: String, default: '' },
  deducciones: { type: String, default: '' },
  notas: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

fiscalProfileSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const FiscalProfile = mongoose.model<IFiscalProfile>('FiscalProfile', fiscalProfileSchema);
