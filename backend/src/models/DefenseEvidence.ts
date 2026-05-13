import mongoose, { Schema } from 'mongoose';

export interface IDefenseEvidence {
  _id: string;
  chatId: string;
  accountId: string;
  createdBy: string;
  exhibitNumber: string;
  type: string;
  description: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  publicToken: string;
  dateObtained: string;
  status: 'pending' | 'presented' | 'admitted' | 'excluded';
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
}

const defenseEvidenceSchema = new Schema<IDefenseEvidence>({
  _id: { type: String, required: true },
  chatId: { type: String, required: true, index: true },
  accountId: { type: String, required: true, index: true },
  createdBy: { type: String, default: '' },
  exhibitNumber: { type: String, default: '' },
  type: { type: String, default: '' },
  description: { type: String, default: '' },
  fileName: { type: String, default: '' },
  filePath: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  mimeType: { type: String, default: '' },
  publicToken: { type: String, default: '' },
  dateObtained: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'presented', 'admitted', 'excluded'], default: 'pending' },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false, versionKey: false });

defenseEvidenceSchema.index({ chatId: 1, exhibitNumber: 1 });
defenseEvidenceSchema.index({ publicToken: 1 });

defenseEvidenceSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const DefenseEvidence = mongoose.model<IDefenseEvidence>('DefenseEvidence', defenseEvidenceSchema);
