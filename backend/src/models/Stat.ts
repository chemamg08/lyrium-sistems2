import mongoose, { Schema } from 'mongoose';

export interface IStat {
  _id: string;
  contractsDownloaded: number;
  defensesExported: number;
  contractsCreated: number;
  defensesCreated: number;
}

const statSchema = new Schema<IStat>({
  _id: { type: String, required: true },
  contractsDownloaded: { type: Number, default: 0 },
  defensesExported: { type: Number, default: 0 },
  contractsCreated: { type: Number, default: 0 },
  defensesCreated: { type: Number, default: 0 },
}, { _id: false, versionKey: false });

statSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Stat = mongoose.model<IStat>('Stat', statSchema);
