import mongoose, { Schema } from 'mongoose';

export interface IEspecialidad {
  id: string;
  nombre: string;
  descripcion: string;
  createdAt: string;
}

export interface ICuentaCorreo {
  id: string;
  plataforma: string;
  correo: string;
  password: string;
  createdAt: string;
}

export interface IDocumento {
  id: string;
  nombre: string;
  filename: string;
  extractedText: string;
  uploadedAt: string;
}

export interface IEmailMessage {
  id: string;
  from: string;
  text: string;
  time: string;
  sent: boolean;
}

export interface IEmailConversation {
  id: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  messages: IEmailMessage[];
  lastMessageTime: string;
  unread: number;
  autoClientId?: string;
  autoReplyPaused?: boolean;
}

export interface IPendingConsulta {
  id: string;
  originalFrom: string;
  originalFromName: string;
  originalSubject: string;
  originalBody: string;
  cuentaCorreoId: string;
  conversationId: string;
  forwardedAt: string;
  type: string;
  especialidadId?: string;
}

export interface IAutomation {
  _id: string;
  accountId: string;
  especialidades: IEspecialidad[];
  cuentasCorreo: ICuentaCorreo[];
  correosConsultas: string[];
  documentos: IDocumento[];
  switchActivo: boolean;
  subcuentaEspecialidades: Record<string, string>;
  sortByCarga: boolean;
  autoAssignEnabled: boolean;
  emailConversations: IEmailConversation[];
  pendingConsultas: IPendingConsulta[];
}

const especialidadSchema = new Schema({
  id: String,
  nombre: String,
  descripcion: String,
  createdAt: String,
}, { _id: false });

const cuentaCorreoSchema = new Schema({
  id: String,
  plataforma: String,
  correo: String,
  password: String,
  createdAt: String,
}, { _id: false });

const documentoSchema = new Schema({
  id: String,
  nombre: String,
  filename: String,
  extractedText: String,
  uploadedAt: String,
}, { _id: false });

const emailMessageSchema = new Schema({
  id: String,
  from: String,
  text: String,
  time: String,
  sent: Boolean,
}, { _id: false });

const emailConversationSchema = new Schema({
  id: String,
  contactName: String,
  contactEmail: String,
  subject: String,
  messages: { type: [emailMessageSchema], default: [] },
  lastMessageTime: String,
  unread: { type: Number, default: 0 },
  autoClientId: String,
  autoReplyPaused: { type: Boolean, default: false },
}, { _id: false });

const pendingConsultaSchema = new Schema({
  id: String,
  originalFrom: String,
  originalFromName: String,
  originalSubject: String,
  originalBody: String,
  cuentaCorreoId: String,
  conversationId: String,
  forwardedAt: String,
  type: String,
  especialidadId: String,
}, { _id: false });

const automationSchema = new Schema<IAutomation>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, unique: true },
  especialidades: { type: [especialidadSchema], default: [] },
  cuentasCorreo: { type: [cuentaCorreoSchema], default: [] },
  correosConsultas: { type: [String], default: [] },
  documentos: { type: [documentoSchema], default: [] },
  switchActivo: { type: Boolean, default: false },
  subcuentaEspecialidades: { type: Schema.Types.Mixed, default: {} },
  sortByCarga: { type: Boolean, default: false },
  autoAssignEnabled: { type: Boolean, default: false },
  emailConversations: { type: [emailConversationSchema], default: [] },
  pendingConsultas: { type: [pendingConsultaSchema], default: [] },
}, { _id: false, versionKey: false });

automationSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Automation = mongoose.model<IAutomation>('Automation', automationSchema);
