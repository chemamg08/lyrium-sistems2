import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CacheEntry<T> = { expiresAt: number; value: T };

const cache = new Map<string, CacheEntry<any>>();

const TTL_DAY = 24 * 60 * 60 * 1000;
const TTL_WEEK = 7 * TTL_DAY;

export interface ExternalTaxSnapshot {
  vatRate: number;
  incomeTaxRate: number;
  corporateTaxRate: number;
  exchangeRateEurUsd: number;
  sources: string[];
}

interface LocalTaxFile {
  vat?: {
    standard?: number;
    general?: number;
  };
  iva?: {
    standard?: number;
    general?: number;
  };
  incomeTax?: {
    brackets?: Array<{ rate?: number; tipo?: number }>;
  };
  irpf?: {
    tramoEstatales?: Array<{ tipo?: number }>;
    tramoAutonomicos?: Array<{ tipo?: number }>;
  };
  corporateTax?: {
    standard?: number;
  };
  is?: {
    tipoGeneral?: number;
  };
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function withTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function countryCode(input?: string): string {
  const code = (input || '').trim().toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new Error('country is required');
  }
  return code;
}

function localTaxFile(code: string): LocalTaxFile | null {
  const filePath = path.join(__dirname, '../config/taxRates', `${code.toLowerCase()}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as LocalTaxFile;
  } catch {
    return null;
  }
}

function average(values: number[]): number {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return 0;
  const total = nums.reduce((acc, curr) => acc + curr, 0);
  return Math.round((total / nums.length) * 100) / 100;
}

function parseNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseApilayerIncomeTax(payload: any): number {
  if (!payload || typeof payload !== 'object') return 0;

  const direct = parseNumber(payload.income_tax_rate ?? payload.personal_income_tax ?? payload.rate);
  if (direct > 0) return direct;

  const brackets = payload.income_tax_brackets ?? payload.brackets ?? payload.data?.income_tax_brackets;
  if (Array.isArray(brackets)) {
    const rates = brackets.map((b: any) => parseNumber(b.rate ?? b.percentage ?? b.tipo)).filter((v: number) => v > 0);
    return average(rates);
  }

  return 0;
}

function parseApilayerCorporateTax(payload: any): number {
  if (!payload || typeof payload !== 'object') return 0;

  const direct = parseNumber(payload.corporate_tax_rate ?? payload.corporate_tax ?? payload.company_tax_rate);
  if (direct > 0) return direct;

  const nested = parseNumber(payload.data?.corporate_tax_rate ?? payload.data?.corporate_tax);
  return nested > 0 ? nested : 0;
}

async function getVatRateFromVatcomply(code: string): Promise<number> {
  const key = `vatcomply:${code}`;
  const cached = getCached<number>(key);
  if (cached !== null) return cached;

  const res = await withTimeout('https://api.vatcomply.com/rates', { method: 'GET' });
  if (!res.ok) throw new Error('vatcomply unavailable');
  const data = await res.json() as { rates?: Record<string, number> };
  const rate = parseNumber(data?.rates?.[code]);
  if (rate <= 0) throw new Error('vatcomply missing country');
  return setCached(key, rate, TTL_DAY);
}

async function getVatRateFromAvalara(code: string): Promise<number> {
  const account = process.env.AVALARA_ACCOUNT_ID;
  const license = process.env.AVALARA_LICENSE_KEY;
  const environment = process.env.AVALARA_ENVIRONMENT === 'production' ? 'rest.avatax.com' : 'sandbox-rest.avatax.com';

  if (!account || !license) throw new Error('avalara credentials missing');

  const key = `avalara:vat:${code}`;
  const cached = getCached<number>(key);
  if (cached !== null) return cached;

  const auth = Buffer.from(`${account}:${license}`).toString('base64');
  const url = `https://${environment}/api/v2/definitions/countries/${code}`;
  const res = await withTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) throw new Error('avalara unavailable');
  const data = await res.json() as any;

  const candidateRates = [
    parseNumber(data?.vatRate),
    parseNumber(data?.defaultTaxRate),
    parseNumber(data?.rates?.standard),
  ].filter((n) => n > 0);

  if (!candidateRates.length) throw new Error('avalara missing vat rate');
  return setCached(key, candidateRates[0], TTL_DAY);
}

async function getIncomeTaxRateFromApilayer(code: string): Promise<number> {
  const apiKey = process.env.APILAYER_TAX_API_KEY;
  if (!apiKey) throw new Error('apilayer key missing');

  const key = `apilayer:income:${code}`;
  const cached = getCached<number>(key);
  if (cached !== null) return cached;

  const res = await withTimeout(`https://api.apilayer.com/tax_data/latest?country=${encodeURIComponent(code)}`, {
    method: 'GET',
    headers: {
      apikey: apiKey,
      Accept: 'application/json',
    },
  });

  if (!res.ok) throw new Error('apilayer income unavailable');
  const payload = await res.json();
  const rate = parseApilayerIncomeTax(payload);
  if (rate <= 0) throw new Error('apilayer income missing rate');
  return setCached(key, rate, TTL_WEEK);
}

async function getCorporateTaxRateFromApilayer(code: string): Promise<number> {
  const apiKey = process.env.APILAYER_TAX_API_KEY;
  if (!apiKey) throw new Error('apilayer key missing');

  const key = `apilayer:corporate:${code}`;
  const cached = getCached<number>(key);
  if (cached !== null) return cached;

  const res = await withTimeout(`https://api.apilayer.com/tax_data/latest?country=${encodeURIComponent(code)}`, {
    method: 'GET',
    headers: {
      apikey: apiKey,
      Accept: 'application/json',
    },
  });

  if (!res.ok) throw new Error('apilayer corporate unavailable');
  const payload = await res.json();
  const rate = parseApilayerCorporateTax(payload);
  if (rate <= 0) throw new Error('apilayer corporate missing rate');
  return setCached(key, rate, TTL_WEEK);
}

function getLocalVatRate(code: string): number {
  const data = localTaxFile(code);
  if (!data) return 0;
  const value = parseNumber(data.vat?.standard ?? data.vat?.general ?? data.iva?.standard ?? data.iva?.general);
  return value > 0 ? value : 0;
}

function getLocalIncomeTaxRate(code: string): number {
  const data = localTaxFile(code);
  if (!data) return 0;

  const fromIncomeTax = data.incomeTax?.brackets?.map((b) => parseNumber(b.rate ?? b.tipo)).filter((v) => v > 0) || [];
  if (fromIncomeTax.length) return average(fromIncomeTax);

  const estatal = data.irpf?.tramoEstatales?.map((b) => parseNumber(b.tipo)).filter((v) => v > 0) || [];
  const autonomica = data.irpf?.tramoAutonomicos?.map((b) => parseNumber(b.tipo)).filter((v) => v > 0) || [];
  const combined = [...estatal, ...autonomica];
  return combined.length ? average(combined) : 0;
}

function getLocalCorporateTaxRate(code: string): number {
  const data = localTaxFile(code);
  if (!data) return 0;

  const value = parseNumber(data.corporateTax?.standard ?? data.is?.tipoGeneral);
  return value > 0 ? value : 0;
}

async function getExchangeRateEurUsd(): Promise<number> {
  // Single-country account model: no FX conversion is required for compliance flows.
  // Keep this field for backwards compatibility in stored metadata.
  return 1;
}

export async function validateVatNumber(vatNumber: string): Promise<{ valid: boolean; source: string }> {
  const sanitized = (vatNumber || '').replace(/\s+/g, '').toUpperCase();
  if (!sanitized) return { valid: false, source: 'none' };

  try {
    const res = await withTimeout(`https://api.vatcomply.com/vat?vat_number=${encodeURIComponent(sanitized)}`, { method: 'GET' });
    if (res.ok) {
      const payload = await res.json() as any;
      if (typeof payload?.valid === 'boolean') {
        return { valid: payload.valid, source: 'vatcomply' };
      }
    }
  } catch {
    // fallback below
  }

  const basicPattern = /^[A-Z]{2}[A-Z0-9]{6,14}$/;
  return { valid: basicPattern.test(sanitized), source: 'local-regex' };
}

export async function getExternalTaxSnapshot(country?: string): Promise<ExternalTaxSnapshot> {
  const code = countryCode(country);
  const sources: string[] = [];

  let vatRate = 0;
  try {
    vatRate = await getVatRateFromAvalara(code);
    sources.push('avalara');
  } catch {
    try {
      vatRate = await getVatRateFromVatcomply(code);
      sources.push('vatcomply');
    } catch {
      vatRate = getLocalVatRate(code);
      sources.push('local-vat');
    }
  }

  let incomeTaxRate = 0;
  try {
    incomeTaxRate = await getIncomeTaxRateFromApilayer(code);
    sources.push('apilayer-income');
  } catch {
    incomeTaxRate = getLocalIncomeTaxRate(code);
    sources.push('local-income');
  }

  let corporateTaxRate = 0;
  try {
    corporateTaxRate = await getCorporateTaxRateFromApilayer(code);
    sources.push('apilayer-corporate');
  } catch {
    corporateTaxRate = getLocalCorporateTaxRate(code);
    sources.push('local-corporate');
  }

  const exchangeRateEurUsd = await getExchangeRateEurUsd();
  sources.push('fx-fixed-single-country');

  return {
    vatRate,
    incomeTaxRate,
    corporateTaxRate,
    exchangeRateEurUsd,
    sources,
  };
}
