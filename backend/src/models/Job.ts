import mongoose, { Schema } from 'mongoose';

export interface IJob {
  _id: string;
  type: string;
  status: string;
  createdAt: string;
  accountId: string;
  request: any;
  startedAt: string;
  result: any;
  finishedAt: string;
  error: string;
}

const jobSchema = new Schema<IJob>({
  _id: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, default: 'pending' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  accountId: { type: String, default: '' },
  request: { type: Schema.Types.Mixed, default: {} },
  startedAt: { type: String, default: null },
  result: { type: Schema.Types.Mixed, default: null },
  finishedAt: { type: String, default: null },
  error: { type: String, default: null },
}, { _id: false, versionKey: false });

jobSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Job = mongoose.model<IJob>('Job', jobSchema);
