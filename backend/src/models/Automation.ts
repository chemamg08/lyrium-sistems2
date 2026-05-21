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
  customSmtpHost?: string;
  customSmtpPort?: number;
  customImapHost?: string;
  customImapPort?: number;
}

export interface IDocumento {
  id: string;
  nombre: string;
  filename: string;
  extractedText: string;
  uploadedAt: string;
}

export interface IEmailAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface IEmailMessage {
  id: string;
  from: string;
  text: string;
  time: string;
  sent: boolean;
  messageId?: string;
  references?: string;
  inReplyTo?: string;
  attachments?: IEmailAttachment[];
}

export interface IEmailConversation {
  id: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  messages: IEmailMessage[];
  lastMessageTime: string;
  unread: number;
  cuentaCorreoId?: string;
  cuentaCorreoEmail?: string;
  autoClientId?: string;
  autoReplyPaused?: boolean;
  classificationType?: 'consulta_general' | 'solicitud_servicio' | 'otro';
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
  channel?: 'email' | 'whatsapp';
  waContactPhone?: string;
  waConversationId?: string;
}

export interface IPendingReply {
  id: string;
  to: string;
  subject: string;
  text: string;
  messageId?: string;
  references?: string;
  scheduledAt: number;
  accountId: string;
  conversationId?: string;
  cuentaCorreoId?: string;
  retryCount: number;
}

export interface IEmailFolder {
  id: string;
  name: string;
  conversationIds: string[];
}

export interface IEmailClassifyRule {
  id: string;
  name: string;
  description: string;
  folderIds: string[];
  createdAt: string;
}

export interface IWhatsAppClassifyRule {
  id: string;
  name: string;
  description: string;
  folderIds: string[];
  createdAt: string;
}

// ── WhatsApp ─────────────────────────────────────────────────────────
export interface IWhatsAppAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface IWhatsAppMessage {
  id: string;
  from: string;
  text: string;
  time: string;
  sent: boolean;
  attachments?: IWhatsAppAttachment[];
}

export interface IWhatsAppConversation {
  id: string;
  contactName: string;
  contactPhone: string;
  messages: IWhatsAppMessage[];
  lastMessageTime: string;
  unread: number;
  autoReplyPaused?: boolean;
  phoneNumberId?: string;
}

export interface IWhatsAppFolder {
  id: string;
  name: string;
  color?: string;
  conversationIds: string[];
}

export interface IWhatsAppSession {
  provider?: 'meta';
  instanceName?: string;
  connected: boolean;
  phoneNumber?: string;
  connectedAt?: string;
  businessAccountId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  name?: string;
  tokenExpiresAt?: string;
  tokenType?: string;
  alertEmail?: string;
  credentialMode?: 'quick_official' | 'manual_long_lived';
  expiryKnown?: boolean;
  connectionStatus?: 'ok' | 'warning' | 'expired' | 'error' | 'disconnected';
  lastValidatedAt?: string;
  lastValidationError?: string;
  lastExpiryReminder7dAt?: string;
  lastExpiryReminder3dAt?: string;
  lastExpiryReminder1dAt?: string;
  lastExpiryReminder0dAt?: string;
  lastFailureAlertAt?: string;
  failureAlertOpen?: boolean;
  failureFirstDetectedAt?: string;
  failureResolvedAt?: string;
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
  emailFolders: IEmailFolder[];
  emailClassifyRules: IEmailClassifyRule[];
  pendingReplies: IPendingReply[];
  respondConsultasGenerales: boolean;
  respondSolicitudesServicio: boolean;
  soloContactosConocidos: boolean;
  // WhatsApp
  whatsappSessions?: IWhatsAppSession[];
  /** @deprecated Use whatsappSessions instead */
  whatsappSession?: IWhatsAppSession;
  whatsappSwitchActivo: boolean;
  whatsappConversations: IWhatsAppConversation[];
  whatsappFolders: IWhatsAppFolder[];
  whatsappCorreosConsultas: string[];
  whatsappClassifyRules: IWhatsAppClassifyRule[];
  whatsappRespondConsultasGenerales: boolean;
  whatsappRespondSolicitudesServicio: boolean;
  whatsappSoloContactosConocidos: boolean;
  whatsappOAuthState?: string;
  whatsappOAuthStateExpires?: string;
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
  customSmtpHost: { type: String, default: '' },
  customSmtpPort: { type: Number, default: 587 },
  customImapHost: { type: String, default: '' },
  customImapPort: { type: Number, default: 993 },
}, { _id: false });

const documentoSchema = new Schema({
  id: String,
  nombre: String,
  filename: String,
  extractedText: String,
  uploadedAt: String,
}, { _id: false });

const emailAttachmentSchema = new Schema({
  id: String,
  filename: String,
  originalName: String,
  mimeType: String,
  size: Number,
}, { _id: false });

const emailMessageSchema = new Schema({
  id: String,
  from: String,
  text: String,
  time: String,
  sent: Boolean,
  messageId: String,
  references: String,
  inReplyTo: String,
  attachments: { type: [emailAttachmentSchema], default: [] },
}, { _id: false });

const emailConversationSchema = new Schema({
  id: String,
  contactName: String,
  contactEmail: String,
  subject: String,
  messages: { type: [emailMessageSchema], default: [] },
  lastMessageTime: String,
  unread: { type: Number, default: 0 },
  cuentaCorreoId: String,
  cuentaCorreoEmail: String,
  autoClientId: String,
  autoReplyPaused: { type: Boolean, default: false },
  classificationType: { type: String, default: undefined },
}, { _id: false });

const emailFolderSchema = new Schema({
  id: String,
  name: String,
  conversationIds: { type: [String], default: [] },
}, { _id: false });

const emailClassifyRuleSchema = new Schema({
  id: String,
  name: String,
  description: String,
  folderIds: { type: [String], default: [] },
  createdAt: String,
}, { _id: false });

const waClassifyRuleSchema = new Schema({
  id: String,
  name: String,
  description: String,
  folderIds: { type: [String], default: [] },
  createdAt: String,
}, { _id: false });

// ── WhatsApp schemas ─────────────────────────────────────────────────
const waAttachmentSchema = new Schema({
  id: String,
  filename: String,
  originalName: String,
  mimeType: String,
  size: Number,
}, { _id: false });

const waMessageSchema = new Schema({
  id: String,
  from: String,
  text: String,
  time: String,
  sent: Boolean,
  attachments: { type: [waAttachmentSchema], default: [] },
}, { _id: false });

const waConversationSchema = new Schema({
  id: String,
  contactName: String,
  contactPhone: String,
  messages: { type: [waMessageSchema], default: [] },
  lastMessageTime: String,
  unread: { type: Number, default: 0 },
  autoReplyPaused: { type: Boolean, default: false },
  phoneNumberId: String,
}, { _id: false });

const waFolderSchema = new Schema({
  id: String,
  name: String,
  color: String,
  conversationIds: { type: [String], default: [] },
}, { _id: false });

const whatsappSessionSchema = new Schema({
  provider: { type: String, default: 'meta' },
  instanceName: String,
  connected: { type: Boolean, default: false },
  phoneNumber: String,
  connectedAt: String,
  businessAccountId: String,
  phoneNumberId: String,
  accessToken: String,
  tokenExpiresAt: String,
  tokenType: { type: String, enum: ['short', 'long', 'business_integration', 'unknown'] },
  name: String,
  alertEmail: String,
  credentialMode: { type: String, enum: ['quick_official', 'manual_long_lived'] },
  expiryKnown: { type: Boolean, default: false },
  connectionStatus: {
    type: String,
    enum: ['ok', 'warning', 'expired', 'error', 'disconnected'],
    default: 'disconnected',
  },
  lastValidatedAt: String,
  lastValidationError: String,
  lastExpiryReminder7dAt: String,
  lastExpiryReminder3dAt: String,
  lastExpiryReminder1dAt: String,
  lastExpiryReminder0dAt: String,
  lastFailureAlertAt: String,
  failureAlertOpen: { type: Boolean, default: false },
  failureFirstDetectedAt: String,
  failureResolvedAt: String,
}, { _id: false });

// @deprecated Kept for backward compatibility, use whatsappSessionSchema
const waSessionSchema = whatsappSessionSchema;

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
  channel: { type: String, default: 'email' },
  waContactPhone: String,
  waConversationId: String,
}, { _id: false });

const pendingReplySchema = new Schema({
  id: String,
  to: String,
  subject: String,
  text: String,
  messageId: String,
  references: String,
  scheduledAt: Number,
  accountId: String,
  conversationId: String,
  cuentaCorreoId: String,
  retryCount: { type: Number, default: 0 },
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
  emailFolders: { type: [emailFolderSchema], default: [] },
  emailClassifyRules: { type: [emailClassifyRuleSchema], default: [] },
  pendingReplies: { type: [pendingReplySchema], default: [] },
  respondConsultasGenerales: { type: Boolean, default: true },
  respondSolicitudesServicio: { type: Boolean, default: true },
  soloContactosConocidos: { type: Boolean, default: false },
  // WhatsApp
  whatsappSessions: { type: [whatsappSessionSchema], default: [] },
  /** @deprecated Use whatsappSessions instead */
  whatsappSession: { type: waSessionSchema, default: null },
  whatsappSwitchActivo: { type: Boolean, default: false },
  whatsappConversations: { type: [waConversationSchema], default: [] },
  whatsappFolders: { type: [waFolderSchema], default: [] },
  whatsappCorreosConsultas: { type: [String], default: [] },
  whatsappClassifyRules: { type: [waClassifyRuleSchema], default: [] },
  whatsappRespondConsultasGenerales: { type: Boolean, default: true },
  whatsappRespondSolicitudesServicio: { type: Boolean, default: true },
  whatsappSoloContactosConocidos: { type: Boolean, default: false },
  whatsappOAuthState: { type: String, default: null },
  whatsappOAuthStateExpires: { type: String, default: null },
}, { _id: false, versionKey: false });

automationSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const Automation = mongoose.model<IAutomation>('Automation', automationSchema);
