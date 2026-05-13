import { Response } from 'express';
import Case from '../models/Case.js';
import { Client } from '../models/Client.js';
import { Subaccount } from '../models/Subaccount.js';
import { Automation } from '../models/Automation.js';
import { Account } from '../models/Account.js';
import { Subscription } from '../models/Subscription.js';
import type { AuthRequest } from '../middleware/auth.js';
import { verifyOwnership } from '../middleware/auth.js';

export async function getCases(req: AuthRequest, res: Response) {
  try {
    const { accountId, status, source } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId required' });
    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ error: 'No tienes permiso para ver estos casos' });
    }
    const filter: any = { accountId };
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (req.user && (req.user as any).type === 'subaccount') {
      filter.assignedSubaccountId = (req.user as any).userId;
    }
    const cases = await Case.find(filter).sort({ createdAt: -1 });
    res.json(cases);
  } catch (err) {
    console.error('[getCases] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getCaseById(req: AuthRequest, res: Response) {
  try {
    const { caseId } = req.params;
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) return res.status(404).json({ error: 'Case not found' });
    if (!verifyOwnership(req, caseDoc.accountId)) {
      return res.status(403).json({ error: 'No tienes permiso para ver este caso' });
    }
    res.json(caseDoc);
  } catch (err) {
    console.error('[getCaseById] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function assignCase(req: AuthRequest, res: Response) {
  try {
    const { caseId } = req.params;
    const { subaccountId } = req.body;
    const subaccount = await Subaccount.findById(subaccountId);
    if (!subaccount) return res.status(404).json({ error: 'Subaccount not found' });
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) return res.status(404).json({ error: 'Case not found' });
    if (!verifyOwnership(req, caseDoc.accountId)) {
      return res.status(403).json({ error: 'No tienes permiso para asignar este caso' });
    }
    const updatedCase = await Case.findByIdAndUpdate(
      caseId,
      {
        status: 'assigned',
        assignedSubaccountId: subaccountId,
        assignedSubaccountName: subaccount.name || subaccount.email,
        assignedAt: new Date().toISOString(),
      },
      { returnDocument: 'after' }
    );
    if (!updatedCase) return res.status(404).json({ error: 'Case not found' });
    res.json(updatedCase);
  } catch (err) {
    console.error('[assignCase] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateCaseStatus(req: AuthRequest, res: Response) {
  try {
    const { caseId } = req.params;
    const { status } = req.body;
    if (!['pending', 'assigned', 'closed', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) return res.status(404).json({ error: 'Case not found' });
    if (!verifyOwnership(req, caseDoc.accountId)) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este caso' });
    }
    const update: any = { status };
    if (status === 'closed') update.closedAt = new Date().toISOString();
    if (status === 'rejected') update.rejectedAt = new Date().toISOString();
    const updatedCase = await Case.findByIdAndUpdate(caseId, update, { returnDocument: 'after' });
    if (!updatedCase) return res.status(404).json({ error: 'Case not found' });

    if (status === 'closed' && updatedCase.linkedClientId) {
      await Client.findByIdAndUpdate(updatedCase.linkedClientId, {
        status: 'finalizado',
      });
    }

    res.json(updatedCase);
  } catch (err) {
    console.error('[updateCaseStatus] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function linkCaseToClient(req: AuthRequest, res: Response) {
  try {
    const { caseId } = req.params;
    const { clientId } = req.body;
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) return res.status(404).json({ error: 'Case not found' });
    if (!verifyOwnership(req, caseDoc.accountId)) {
      return res.status(403).json({ error: 'No tienes permiso para vincular este caso' });
    }
    const updatedCase = await Case.findByIdAndUpdate(
      caseId,
      { linkedClientId: clientId, linkedClientName: client.name },
      { returnDocument: 'after' }
    );
    if (!updatedCase) return res.status(404).json({ error: 'Case not found' });
    res.json(updatedCase);
  } catch (err) {
    console.error('[linkCaseToClient] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createManualCase(req: AuthRequest, res: Response) {
  try {
    const { accountId, contactName, contactEmail, contactPhone, subject, body, especialidadId, especialidadName, linkedClientId, linkedClientName, assignedSubaccountId } = req.body;

    if (!verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'No tienes permiso para crear casos en esta cuenta' });
    }

    const subscription = await Subscription.findOne({ accountId });
    if (subscription && subscription.plan === 'free') {
      const activeCases = await Case.countDocuments({ accountId, status: { $nin: ['closed', 'archived'] } });
      const account = await Account.findById(accountId).select('planDowngradedAt').lean();
      const inGracePeriod = account?.planDowngradedAt && (new Date().getTime() - new Date(account.planDowngradedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
      if (!inGracePeriod && activeCases >= 5) {
        return res.status(403).json({ error: 'Has alcanzado el límite de 5 casos activos del plan Sin Cargo. Suscríbete a un plan de pago para añadir más.' });
      }
    }

    const caseData: any = {
      _id: Date.now().toString(),
      accountId,
      source: 'manual',
      sourceId: `manual_${Date.now()}`,
      contactName: contactName || 'Sin nombre',
      contactEmail,
      contactPhone,
      subject,
      body: body || '',
      status: 'pending',
      especialidadId,
      especialidadName,
      linkedClientId,
      linkedClientName,
      classificationType: 'manual',
      createdAt: new Date().toISOString(),
      autoAssignEnabledAtCreation: false,
    };

    if (assignedSubaccountId) {
      const subaccount = await Subaccount.findById(assignedSubaccountId);
      if (subaccount) {
        caseData.status = 'assigned';
        caseData.assignedSubaccountId = assignedSubaccountId;
        caseData.assignedSubaccountName = subaccount.name || subaccount.email;
        caseData.assignedAt = new Date().toISOString();
      }
    }

    if (req.user && (req.user as any).type === 'subaccount') {
      caseData.assignedSubaccountId = (req.user as any).userId;
      caseData.assignedSubaccountName = (req.user as any).email || '';
      caseData.status = 'assigned';
      caseData.assignedAt = new Date().toISOString();
    }

    const newCase = await Case.create(caseData);
    res.status(201).json(newCase);
  } catch (err) {
    console.error('[createManualCase] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getCaseConversation(req: AuthRequest, res: Response) {
  try {
    const { caseId } = req.params;
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) return res.status(404).json({ error: 'Case not found' });
    if (!verifyOwnership(req, caseDoc.accountId)) {
      return res.status(403).json({ error: 'No tienes permiso para ver esta conversación' });
    }

    const automation = await Automation.findById(caseDoc.accountId);
    if (!automation) return res.status(404).json({ error: 'Account automation not found' });

    let messages: any[] = [];

    if (caseDoc.source === 'email') {
      const conv = automation.emailConversations?.find((c: any) => c.id === caseDoc.sourceId);
      if (conv && conv.messages) {
        messages = conv.messages.map((m: any) => ({
          id: m.id,
          from: m.sent ? 'Asistente' : (conv.contactName || conv.contactEmail || 'Cliente'),
          text: m.text,
          time: m.time,
          sent: m.sent,
          attachments: m.attachments || [],
        }));
      }
    } else if (caseDoc.source === 'whatsapp') {
      const conv = automation.whatsappConversations?.find((c: any) => c.id === caseDoc.sourceId);
      if (conv && conv.messages) {
        messages = conv.messages.map((m: any) => ({
          id: m.id,
          from: m.sent ? 'Asistente' : (conv.contactName || conv.contactPhone || 'Cliente'),
          text: m.text,
          time: m.time,
          sent: m.sent,
        }));
      }
    }

    res.json({ messages });
  } catch (err) {
    console.error('[getCaseConversation] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteCase(req: AuthRequest, res: Response) {
  try {
    const { caseId } = req.params;
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) return res.status(404).json({ error: 'Case not found' });
    if (!verifyOwnership(req, caseDoc.accountId)) {
      return res.status(403).json({ error: 'No tienes permiso para borrar este caso' });
    }
    await Case.findByIdAndDelete(caseId);
    res.json({ message: 'Case deleted' });
  } catch (err) {
    console.error('[deleteCase] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateCaseNotes(req: AuthRequest, res: Response) {
  try {
    const { caseId } = req.params;
    const { notes } = req.body;
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) return res.status(404).json({ error: 'Case not found' });
    if (!verifyOwnership(req, caseDoc.accountId)) {
      return res.status(403).json({ error: 'No tienes permiso para editar las notas de este caso' });
    }
    const updatedCase = await Case.findByIdAndUpdate(
      caseId,
      { notes: notes || '' },
      { returnDocument: 'after' }
    );
    if (!updatedCase) return res.status(404).json({ error: 'Case not found' });
    res.json(updatedCase);
  } catch (err) {
    console.error('[updateCaseNotes] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
