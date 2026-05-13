import mongoose, { Schema } from 'mongoose';

export interface ICase {
  _id: string;
  accountId: string;
  source: 'email' | 'whatsapp' | 'manual';
  sourceId: string; // conversationId o waConversationId
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  subject?: string;
  body: string;
  status: 'pending' | 'assigned' | 'closed' | 'rejected';
  especialidadId?: string;
  especialidadName?: string;
  assignedSubaccountId?: string;
  assignedSubaccountName?: string;
  linkedClientId?: string;
  linkedClientName?: string;
  classificationType: 'solicitud_servicio' | 'intencion_implicita' | 'manual';
  createdAt: string;
  assignedAt?: string;
  closedAt?: string;
  rejectedAt?: string;
  autoAssignEnabledAtCreation: boolean;
  notes?: string;
}

const caseSchema = new Schema<ICase>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  source: { type: String, enum: ['email', 'whatsapp', 'manual'], required: true },
  sourceId: { type: String, required: true },
  contactName: { type: String, required: true },
  contactEmail: { type: String },
  contactPhone: { type: String },
  subject: { type: String },
  body: { type: String, required: true },
  status: { type: String, enum: ['pending', 'assigned', 'closed', 'rejected'], default: 'pending' },
  especialidadId: { type: String },
  especialidadName: { type: String },
  assignedSubaccountId: { type: String },
  assignedSubaccountName: { type: String },
  linkedClientId: { type: String },
  linkedClientName: { type: String },
  classificationType: { type: String, enum: ['solicitud_servicio', 'intencion_implicita', 'manual'], required: true },
  createdAt: { type: String, required: true },
  assignedAt: { type: String },
  closedAt: { type: String },
  rejectedAt: { type: String },
  autoAssignEnabledAtCreation: { type: Boolean, default: false },
  notes: { type: String, default: '' },
});

caseSchema.index({ accountId: 1, status: 1 });
caseSchema.index({ accountId: 1, source: 1 });
caseSchema.index({ accountId: 1, createdAt: -1 });

export default mongoose.model<ICase>('Case', caseSchema);
