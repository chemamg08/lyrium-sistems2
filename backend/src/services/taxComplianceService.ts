import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { TaxObligation, ITaxObligation } from '../models/TaxObligation.js';
import { Calculation } from '../models/Calculation.js';
import { Client } from '../models/Client.js';
import { Account } from '../models/Account.js';
import { getTaxSnapshotForCountry } from './taxRateSyncService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TaxModelDefinition {
  code: string;
  name: string;
  periodType: 'monthly' | 'quarterly' | 'yearly' | 'custom';
  defaultCurrency?: string;
  portalUrl?: string;
  deadlines?: Record<string, string>;
  applicableTo?: string[];
}

interface TaxModelConfig {
  countryCode: string;
  countryName?: string;
  models: TaxModelDefinition[];
}

interface CreateTaxObligationInput {
  accountId: string;
  calculationId: string;
  modelCode?: string;
  period?: string;
  deadline?: string;
  notes?: string;
}

interface ListTaxObligationsFilters {
  accountId: string;
  clientId?: string;
  status?: string;
  period?: string;
  modelCode?: string;
}

interface UpdateTaxObligationInput {
  accountId: string;
  obligationId: string;
  status?: ITaxObligation['status'];
  filedAt?: string;
  paidAt?: string;
  paymentReference?: string;
  notes?: string;
}

function safeDateISO(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function parseCountryCodeFromAccount(accountData: any): string {
  const candidate = (accountData?.country || '') as string;
  return candidate.trim().toUpperCase().slice(0, 2);
}

function computeBaseAmountFromBreakdown(desglose: Array<{ valor: number; isSection?: boolean }>): number {
  const positives = desglose.filter((line) => !line.isSection && line.valor > 0).map((line) => line.valor);
  if (!positives.length) return 0;
  return Math.round(positives.reduce((acc, curr) => acc + curr, 0) * 100) / 100;
}

function computeDeductibleAmountFromBreakdown(desglose: Array<{ valor: number; isSection?: boolean }>): number {
  const negatives = desglose.filter((line) => !line.isSection && line.valor < 0).map((line) => Math.abs(line.valor));
  if (!negatives.length) return 0;
  return Math.round(negatives.reduce((acc, curr) => acc + curr, 0) * 100) / 100;
}

function taxModelConfigPath(countryCode: string): string {
  return path.join(__dirname, '../config/taxModels', `${countryCode.toLowerCase()}.json`);
}

function loadTaxModelConfig(countryCode: string): TaxModelConfig {
  const specificPath = taxModelConfigPath(countryCode);
  if (!fs.existsSync(specificPath)) {
    throw new Error(`No tax model config for country: ${countryCode}`);
  }
  const content = fs.readFileSync(specificPath, 'utf-8');
  return JSON.parse(content) as TaxModelConfig;
}

function resolveDeadline(period: string, model: TaxModelDefinition, fallbackYear: number): string {
  if (!model.deadlines || !Object.keys(model.deadlines).length) {
    return new Date(Date.UTC(fallbackYear, 11, 31)).toISOString();
  }

  const normalized = (period || '').trim().toUpperCase();
  const token = normalized.includes('-') ? normalized.split('-')[0] : normalized;
  const yearToken = normalized.includes('-') ? normalized.split('-').pop() : String(fallbackYear);
  const year = Number(yearToken) || fallbackYear;

  const dayMonth = model.deadlines[token] || model.deadlines.Y || model.deadlines.M || model.deadlines.Q || '';
  if (!dayMonth) return new Date(Date.UTC(year, 11, 31)).toISOString();

  const [monthStr, dayStr] = dayMonth.split('-');
  const month = Math.max(1, Math.min(12, Number(monthStr) || 12));
  const day = Math.max(1, Math.min(31, Number(dayStr) || 31));

  const deadline = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
  return deadline.toISOString();
}

function defaultPeriodForModel(model: TaxModelDefinition): string {
  const year = new Date().getUTCFullYear();
  if (model.periodType === 'yearly') return `Y-${year}`;
  if (model.periodType === 'monthly') {
    const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');
    return `M${month}-${year}`;
  }
  const currentMonth = new Date().getUTCMonth() + 1;
  const quarter = currentMonth <= 3 ? 'T1' : currentMonth <= 6 ? 'T2' : currentMonth <= 9 ? 'T3' : 'T4';
  return `${quarter}-${year}`;
}

function chooseModel(config: TaxModelConfig, clientType: string, requestedCode?: string): TaxModelDefinition {
  const byCode = requestedCode ? config.models.find((model) => model.code === requestedCode) : null;
  if (byCode) return byCode;

  const typed = config.models.find((model) => (model.applicableTo || []).includes(clientType));
  if (typed) return typed;

  return config.models[0];
}

export function getAvailableModels(countryCode: string, clientType?: string): TaxModelDefinition[] {
  const config = loadTaxModelConfig(countryCode);
  if (!clientType) return config.models;
  const models = config.models.filter((model) => {
    const applicable = model.applicableTo || [];
    return !applicable.length || applicable.includes(clientType);
  });
  return models.length ? models : config.models;
}

export async function createTaxObligationFromCalculation(input: CreateTaxObligationInput): Promise<ITaxObligation> {
  const { accountId, calculationId, modelCode, period, deadline, notes } = input;

  const calculation = await Calculation.findById(calculationId);
  if (!calculation) throw new Error('Calculation not found');
  if (calculation.accountId !== accountId) throw new Error('Forbidden');

  const client = await Client.findById(calculation.clientId);
  if (!client) throw new Error('Client not found');
  if (client.accountId !== accountId) throw new Error('Forbidden');

  const account = await Account.findById(accountId);
  if (!account) throw new Error('Account not found');

  const countryCode = parseCountryCodeFromAccount(account);
  if (!countryCode) throw new Error('Account country is required');
  const config = loadTaxModelConfig(countryCode);
  const model = chooseModel(config, calculation.clientType || client.clientType || 'asalariado', modelCode);

  const normalizedPeriod = period || defaultPeriodForModel(model);
  const calculatedDeadline = deadline ? safeDateISO(deadline) : resolveDeadline(normalizedPeriod, model, new Date().getUTCFullYear());
  const external = await getTaxSnapshotForCountry(countryCode);

  const desglose = Array.isArray(calculation.desglose) ? calculation.desglose : [];
  const baseAmount = computeBaseAmountFromBreakdown(desglose);
  const deductibleAmount = computeDeductibleAmountFromBreakdown(desglose);

  const now = new Date().toISOString();
  const obligation = await TaxObligation.create({
    _id: Date.now().toString(),
    accountId,
    clientId: calculation.clientId,
    clientName: calculation.clientName || client.name || '',
    clientType: calculation.clientType || client.clientType || '',
    countryCode,
    currency: calculation.data?.currency || model.defaultCurrency || 'EUR',
    modelCode: model.code,
    modelName: model.name,
    period: normalizedPeriod,
    periodType: model.periodType,
    calculationId: calculation.id || calculationId,
    calculationLabel: calculation.label || '',
    baseAmount,
    deductibleAmount,
    taxDue: calculation.resultado || 0,
    etiquetaTotal: calculation.etiquetaTotal || '',
    desglose,
    externalSources: external.sources,
    metadata: {
      externalRates: {
        vatRate: external.vatRate,
        incomeTaxRate: external.incomeTaxRate,
        corporateTaxRate: external.corporateTaxRate,
        exchangeRateEurUsd: external.exchangeRateEurUsd,
      },
    },
    portalUrl: model.portalUrl || '',
    deadline: calculatedDeadline,
    filedAt: '',
    paidAt: '',
    paymentReference: '',
    notes: notes || '',
    status: 'calculated',
    createdAt: now,
    updatedAt: now,
  });

  return obligation.toJSON() as ITaxObligation;
}

export async function listTaxObligations(filters: ListTaxObligationsFilters): Promise<ITaxObligation[]> {
  const query: Record<string, any> = {
    accountId: filters.accountId,
  };

  if (filters.clientId) query.clientId = filters.clientId;
  if (filters.status) query.status = filters.status;
  if (filters.period) query.period = filters.period;
  if (filters.modelCode) query.modelCode = filters.modelCode;

  const docs = await TaxObligation.find(query).sort({ createdAt: -1 });
  return docs.map((doc) => doc.toJSON() as ITaxObligation);
}

export async function getTaxObligationById(accountId: string, obligationId: string): Promise<ITaxObligation | null> {
  const doc = await TaxObligation.findOne({ _id: obligationId, accountId });
  return doc ? (doc.toJSON() as ITaxObligation) : null;
}

export async function updateTaxObligation(input: UpdateTaxObligationInput): Promise<ITaxObligation | null> {
  const doc = await TaxObligation.findOne({ _id: input.obligationId, accountId: input.accountId });
  if (!doc) return null;

  const now = new Date().toISOString();
  if (input.status) doc.status = input.status;
  if (input.filedAt !== undefined) doc.filedAt = input.filedAt ? safeDateISO(input.filedAt) : '';
  if (input.paidAt !== undefined) doc.paidAt = input.paidAt ? safeDateISO(input.paidAt) : '';
  if (input.paymentReference !== undefined) doc.paymentReference = input.paymentReference;
  if (input.notes !== undefined) doc.notes = input.notes;
  doc.updatedAt = now;

  await doc.save();
  return doc.toJSON() as ITaxObligation;
}

export async function deleteTaxObligation(accountId: string, obligationId: string): Promise<boolean> {
  const result = await TaxObligation.deleteOne({ _id: obligationId, accountId });
  return !!result.deletedCount;
}

export async function buildObligationPdfBuffer(obligation: ITaxObligation): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks: Buffer[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Lyrium - Tax Compliance', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666666').text(`Generated: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1.2);

    doc.fontSize(12).text(`Client: ${obligation.clientName}`);
    doc.text(`Model: ${obligation.modelCode} - ${obligation.modelName}`);
    doc.text(`Period: ${obligation.period}`);
    doc.text(`Country: ${obligation.countryCode}`);
    doc.text(`Status: ${obligation.status}`);
    doc.text(`Deadline: ${obligation.deadline ? new Date(obligation.deadline).toLocaleDateString('es-ES') : '-'}`);
    doc.moveDown();

    doc.fontSize(11).text(`Base amount: ${obligation.baseAmount.toFixed(2)} ${obligation.currency}`);
    doc.text(`Deductible amount: ${obligation.deductibleAmount.toFixed(2)} ${obligation.currency}`);
    doc.font('Helvetica-Bold').text(`Tax due: ${obligation.taxDue.toFixed(2)} ${obligation.currency}`);
    doc.font('Helvetica');
    doc.moveDown();

    doc.fontSize(12).text('Breakdown', { underline: true });
    doc.moveDown(0.5);

    if (!obligation.desglose.length) {
      doc.fontSize(10).text('No breakdown data available.');
    } else {
      obligation.desglose.forEach((line) => {
        if (line.isSection) {
          doc.moveDown(0.5);
          doc.font('Helvetica-Bold').text(String(line.concepto));
          doc.font('Helvetica');
          return;
        }
        doc.fontSize(10).text(`${String(line.concepto)}: ${Number(line.valor || 0).toFixed(2)} ${obligation.currency}`);
      });
    }

    doc.moveDown(1);
    doc.fontSize(9).fillColor('#666666').text('This document is generated by Lyrium for operational compliance tracking. Final filing and payment are performed in the official tax portal.', { align: 'left' });
    doc.end();
  });
}

export async function getDeadlinesOverview(accountId: string): Promise<ITaxObligation[]> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const docs = await TaxObligation.find({
    accountId,
    deadline: { $gte: now.toISOString(), $lte: in30.toISOString() },
    status: { $nin: ['paid'] },
  }).sort({ deadline: 1 });

  return docs.map((doc) => doc.toJSON() as ITaxObligation);
}

export async function getComplianceSummary(accountId: string): Promise<Record<string, any>> {
  const docs = await TaxObligation.find({ accountId });

  const total = docs.length;
  const byStatus = docs.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.status] = (acc[doc.status] || 0) + 1;
    return acc;
  }, {});

  const totalDue = docs.reduce((acc, doc) => acc + (doc.taxDue || 0), 0);
  const pendingDue = docs
    .filter((doc) => doc.status !== 'paid')
    .reduce((acc, doc) => acc + (doc.taxDue || 0), 0);

  return {
    total,
    byStatus,
    totalDue: Math.round(totalDue * 100) / 100,
    pendingDue: Math.round(pendingDue * 100) / 100,
  };
}
