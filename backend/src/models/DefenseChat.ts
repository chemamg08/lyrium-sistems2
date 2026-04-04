import mongoose, { Schema } from 'mongoose';

export interface IDefenseMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ISavedStrategy {
  id: string;
  title: string;
  content: string;
  date: string;
  createdAt: string;
  sections: {
    lineasDefensa: string[];
    argumentosJuridicos: string[];
    jurisprudencia: string[];
    puntosDebiles: string[];
    contraArgumentos: string[];
    recomendaciones: string[];
  };
}

export interface IDefenseChat {
  _id: string;
  accountId: string;
  createdBy: string;
  title: string;
  createdAt: string;
  lastModified: string;
  messages: IDefenseMessage[];
  savedStrategies: ISavedStrategy[];
  awaitingStrategyConfirmation: boolean;
  summary?: string;
}

const defenseMessageSchema = new Schema({
  id: String,
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  timestamp: String,
}, { _id: false });

const savedStrategySchema = new Schema({
  id: String,
  title: String,
  content: String,
  date: String,
  createdAt: String,
  sections: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const defenseChatSchema = new Schema<IDefenseChat>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  createdBy: { type: String, default: '' },
  title: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  lastModified: { type: String, default: () => new Date().toISOString() },
  messages: { type: [defenseMessageSchema], default: [] },
  savedStrategies: { type: [savedStrategySchema], default: [] },
  awaitingStrategyConfirmation: { type: Boolean, default: false },
  summary: { type: String, default: null },
}, { _id: false, versionKey: false });

defenseChatSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const DefenseChat = mongoose.model<IDefenseChat>('DefenseChat', defenseChatSchema);
