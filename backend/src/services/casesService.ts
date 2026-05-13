import Case from '../models/Case.js';

export async function createCaseFromEmail(
  accountId: string,
  account: any,
  email: any,
  conversationId: string,
  especialidadId: string | undefined,
  classificationType: 'solicitud_servicio' | 'intencion_implicita',
  status: 'pending' | 'assigned',
  assignedSubaccountId?: string,
  assignedSubaccountName?: string,
  linkedClientId?: string,
): Promise<void> {
  try {
    const espName = account.especialidades?.find((e: any) => e.id === especialidadId)?.nombre || 'General';
    await Case.create({
      _id: Date.now().toString(),
      accountId,
      source: 'email',
      sourceId: conversationId,
      contactName: email.fromName || email.from || 'Sin nombre',
      contactEmail: email.from,
      subject: email.subject,
      body: (email.body || '').substring(0, 5000),
      status,
      especialidadId,
      especialidadName: espName,
      assignedSubaccountId,
      assignedSubaccountName,
      classificationType,
      linkedClientId: linkedClientId || undefined,
      createdAt: new Date().toISOString(),
      assignedAt: status === 'assigned' ? new Date().toISOString() : undefined,
      autoAssignEnabledAtCreation: account.autoAssignEnabled === true,
    });
  } catch (err) {
    console.error('[createCaseFromEmail] error:', err);
  }
}

export async function createCaseFromWhatsApp(
  accountId: string,
  account: any,
  contactName: string,
  contactPhone: string,
  conversationId: string,
  originalText: string,
  especialidadId: string | undefined,
  classificationType: 'solicitud_servicio' | 'intencion_implicita',
  status: 'pending' | 'assigned',
  assignedSubaccountId?: string,
  assignedSubaccountName?: string,
  linkedClientId?: string,
): Promise<void> {
  try {
    const espName = account.especialidades?.find((e: any) => e.id === especialidadId)?.nombre || 'General';
    await Case.create({
      _id: Date.now().toString(),
      accountId,
      source: 'whatsapp',
      sourceId: conversationId,
      contactName: contactName || contactPhone || 'Sin nombre',
      contactPhone,
      body: (originalText || '').substring(0, 5000),
      status,
      especialidadId,
      especialidadName: espName,
      assignedSubaccountId,
      assignedSubaccountName,
      classificationType,
      linkedClientId: linkedClientId || undefined,
      createdAt: new Date().toISOString(),
      assignedAt: status === 'assigned' ? new Date().toISOString() : undefined,
      autoAssignEnabledAtCreation: account.autoAssignEnabled === true,
    });
  } catch (err) {
    console.error('[createCaseFromWhatsApp] error:', err);
  }
}
