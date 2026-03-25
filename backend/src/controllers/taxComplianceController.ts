import { Request, Response } from 'express';
import { verifyOwnership } from '../middleware/auth.js';
import {
  createTaxObligationFromCalculation,
  listTaxObligations,
  getTaxObligationById,
  updateTaxObligation,
  deleteTaxObligation,
  buildObligationPdfBuffer,
  getDeadlinesOverview,
  getComplianceSummary,
  getAvailableModels,
} from '../services/taxComplianceService.js';
import { getTaxSyncHealth } from '../services/taxRateSyncService.js';

function getAccountId(req: Request): string {
  const fromHeader = req.headers['x-account-id'];
  return typeof fromHeader === 'string' ? fromHeader : '';
}

export async function listObligations(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const docs = await listTaxObligations({
      accountId,
      clientId: typeof req.query.clientId === 'string' ? req.query.clientId : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      period: typeof req.query.period === 'string' ? req.query.period : undefined,
      modelCode: typeof req.query.modelCode === 'string' ? req.query.modelCode : undefined,
    });

    return res.json(docs);
  } catch (error) {
    console.error('Error listing obligations:', error);
    return res.status(500).json({ error: 'Failed to list obligations' });
  }
}

export async function createObligation(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const calculationId = String(req.body?.calculationId || '').trim();
    if (!calculationId) return res.status(400).json({ error: 'calculationId is required' });

    const obligation = await createTaxObligationFromCalculation({
      accountId,
      calculationId,
      modelCode: req.body?.modelCode ? String(req.body.modelCode) : undefined,
      period: req.body?.period ? String(req.body.period) : undefined,
      deadline: req.body?.deadline ? String(req.body.deadline) : undefined,
      notes: req.body?.notes ? String(req.body.notes) : undefined,
    });

    return res.status(201).json(obligation);
  } catch (error: any) {
    console.error('Error creating obligation:', error);
    if (error?.message === 'Forbidden') return res.status(403).json({ error: 'Acceso denegado' });
    if (error?.message === 'Calculation not found' || error?.message === 'Client not found' || error?.message === 'Account not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error?.message === 'Account country is required' || String(error?.message || '').includes('No tax model config for country')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to create obligation' });
  }
}

export async function getObligation(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    const { id } = req.params;
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const obligation = await getTaxObligationById(accountId, id);
    if (!obligation) return res.status(404).json({ error: 'Obligation not found' });

    return res.json(obligation);
  } catch (error) {
    console.error('Error reading obligation:', error);
    return res.status(500).json({ error: 'Failed to read obligation' });
  }
}

export async function patchObligation(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    const { id } = req.params;
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const updated = await updateTaxObligation({
      accountId,
      obligationId: id,
      status: req.body?.status,
      filedAt: req.body?.filedAt,
      paidAt: req.body?.paidAt,
      paymentReference: req.body?.paymentReference,
      notes: req.body?.notes,
    });

    if (!updated) return res.status(404).json({ error: 'Obligation not found' });
    return res.json(updated);
  } catch (error) {
    console.error('Error updating obligation:', error);
    return res.status(500).json({ error: 'Failed to update obligation' });
  }
}

export async function removeObligation(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    const { id } = req.params;
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const ok = await deleteTaxObligation(accountId, id);
    if (!ok) return res.status(404).json({ error: 'Obligation not found or cannot be deleted' });

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting obligation:', error);
    return res.status(500).json({ error: 'Failed to delete obligation' });
  }
}

export async function downloadObligationDocument(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    const { id } = req.params;
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const obligation = await getTaxObligationById(accountId, id);
    if (!obligation) return res.status(404).json({ error: 'Obligation not found' });

    const pdfBuffer = await buildObligationPdfBuffer(obligation);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tax-obligation-${obligation.modelCode}-${obligation.period}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating obligation document:', error);
    return res.status(500).json({ error: 'Failed to generate document' });
  }
}

export async function getDeadlines(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const docs = await getDeadlinesOverview(accountId);
    return res.json(docs);
  } catch (error) {
    console.error('Error reading deadlines:', error);
    return res.status(500).json({ error: 'Failed to read deadlines' });
  }
}

export async function getSummary(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const summary = await getComplianceSummary(accountId);
    return res.json(summary);
  } catch (error) {
    console.error('Error reading compliance summary:', error);
    return res.status(500).json({ error: 'Failed to read summary' });
  }
}

export async function listTaxModels(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    const country = typeof req.params.country === 'string' ? req.params.country.toUpperCase() : 'ES';
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const clientType = typeof req.query.clientType === 'string' ? req.query.clientType : undefined;
    const models = getAvailableModels(country, clientType);
    return res.json(models);
  } catch (error) {
    console.error('Error listing tax models:', error);
    return res.status(500).json({ error: 'Failed to list tax models' });
  }
}

export async function getTaxSyncHealthController(req: Request, res: Response) {
  try {
    const accountId = getAccountId(req);
    if (!accountId) return res.status(400).json({ error: 'Account ID is required' });
    if (!verifyOwnership(req, accountId)) return res.status(403).json({ error: 'Acceso denegado' });

    const health = await getTaxSyncHealth();
    return res.json(health);
  } catch (error) {
    console.error('Error reading tax sync health:', error);
    return res.status(500).json({ error: 'Failed to read tax sync health' });
  }
}
