import mongoose, { Schema } from 'mongoose';

export interface IFlag {
  id: string;
  createdAt: string;
}

export interface IDefenseMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  flags?: IFlag[];
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
  counterReplica?: {
    opponentArguments: string[];
    rebuttals: string[];
    strengthScore: number;
  };
}

export interface ICounterReplica {
  opponentArguments: string[];
  rebuttals: string[];
  strengthScore: number;
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
  latestCounterReplica?: ICounterReplica | null;
  awaitingStrategyConfirmation: boolean;
  summary?: string;
}

const flagSchema = new Schema({
  id: String,
  createdAt: String,
}, { _id: false });

const defenseMessageSchema = new Schema({
  id: String,
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  timestamp: String,
  flags: { type: [flagSchema], default: [] },
}, { _id: false });

const savedStrategySchema = new Schema({
  id: String,
  title: String,
  content: String,
  date: String,
  createdAt: String,
  sections: { type: Schema.Types.Mixed, default: {} },
  counterReplica: {
    opponentArguments: { type: [String], default: [] },
    rebuttals: { type: [String], default: [] },
    strengthScore: { type: Number, default: 0 },
  },
}, { _id: false });

const counterReplicaSchema = new Schema({
  opponentArguments: { type: [String], default: [] },
  rebuttals: { type: [String], default: [] },
  strengthScore: { type: Number, default: 0 },
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
  latestCounterReplica: { type: counterReplicaSchema, default: null },
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
