import mongoose, { Schema } from 'mongoose';

export interface ISpecialtiesSettings {
  _id: string;
  accountId: string;
  specialties: string[];
}

const specialtiesSettingsSchema = new Schema<ISpecialtiesSettings>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, unique: true },
  specialties: { type: [String], default: [] },
}, { _id: false, versionKey: false });

specialtiesSettingsSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const SpecialtiesSettings = mongoose.model<ISpecialtiesSettings>('SpecialtiesSettings', specialtiesSettingsSchema);
