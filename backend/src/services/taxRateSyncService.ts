import { TaxRateSnapshot, ITaxRateSnapshot } from '../models/TaxRateSnapshot.js';
import { ExternalTaxSnapshot, getExternalTaxSnapshot } from './taxApiService.js';

const DEFAULT_COUNTRIES = ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'BR', 'DO'];
const DEFAULT_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 72 * 60 * 60 * 1000;

let workerRunning = false;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCountry(country?: string): string {
  const code = (country || '').trim().toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new Error('Invalid country code');
  }
  return code;
}

function parseCountriesFromEnv(): string[] {
  const raw = (process.env.TAX_SYNC_COUNTRIES || '').trim();
  if (!raw) return DEFAULT_COUNTRIES;

  const countries = raw
    .split(',')
    .map((entry) => {
      try {
        return normalizeCountry(entry);
      } catch {
        return '';
      }
    })
    .filter((entry, idx, arr) => !!entry && arr.indexOf(entry) === idx);

  return countries.length ? countries : DEFAULT_COUNTRIES;
}

function parseIntervalMs(): number {
  const hours = Number(process.env.TAX_SYNC_INTERVAL_HOURS || '');
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_SYNC_INTERVAL_MS;
  return Math.round(hours * 60 * 60 * 1000);
}

function parseStaleAfterMs(): number {
  const hours = Number(process.env.TAX_SNAPSHOT_STALE_HOURS || '');
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_STALE_AFTER_MS;
  return Math.round(hours * 60 * 60 * 1000);
}

function snapshotFromDoc(doc: ITaxRateSnapshot): ExternalTaxSnapshot {
  return {
    vatRate: Number(doc.vatRate || 0),
    incomeTaxRate: Number(doc.incomeTaxRate || 0),
    corporateTaxRate: Number(doc.corporateTaxRate || 0),
    exchangeRateEurUsd: Number(doc.exchangeRateEurUsd || 1),
    sources: Array.isArray(doc.sources) ? doc.sources : [],
  };
}

export interface TaxSyncHealthCountryItem {
  countryCode: string;
  syncStatus: 'ok' | 'warning' | 'error';
  lastSyncedAt: string;
  nextSyncAt: string;
  ageHours: number;
  sources: string[];
  syncError: string;
  rates: {
    vatRate: number;
    incomeTaxRate: number;
    corporateTaxRate: number;
  };
}

export interface TaxSyncHealthSummary {
  generatedAt: string;
  staleAfterHours: number;
  countries: TaxSyncHealthCountryItem[];
  totals: {
    configuredCountries: number;
    syncedCountries: number;
    ok: number;
    warning: number;
    error: number;
  };
}

export async function getTaxSyncHealth(): Promise<TaxSyncHealthSummary> {
  const countries = parseCountriesFromEnv();
  const staleAfterMs = parseStaleAfterMs();
  const docs = await TaxRateSnapshot.find({ countryCode: { $in: countries } }).sort({ countryCode: 1 });
  const now = Date.now();

  const byCountry = new Map<string, ITaxRateSnapshot>();
  for (const doc of docs) {
    const row = doc.toJSON() as ITaxRateSnapshot;
    byCountry.set(normalizeCountry(row.countryCode), row);
  }

  const items: TaxSyncHealthCountryItem[] = countries.map((countryCode) => {
    const doc = byCountry.get(countryCode);
    if (!doc) {
      return {
        countryCode,
        syncStatus: 'warning',
        lastSyncedAt: '',
        nextSyncAt: '',
        ageHours: -1,
        sources: [],
        syncError: 'Snapshot not created yet',
        rates: {
          vatRate: 0,
          incomeTaxRate: 0,
          corporateTaxRate: 0,
        },
      };
    }

    const lastSyncedMs = new Date(doc.lastSyncedAt || '').getTime();
    const ageMs = Number.isFinite(lastSyncedMs) ? Math.max(0, now - lastSyncedMs) : Number.MAX_SAFE_INTEGER;
    const isStale = ageMs > staleAfterMs;
    const status = doc.syncStatus === 'error' ? 'error' : isStale ? 'warning' : 'ok';

    return {
      countryCode,
      syncStatus: status,
      lastSyncedAt: doc.lastSyncedAt || '',
      nextSyncAt: doc.nextSyncAt || '',
      ageHours: Math.round((ageMs / (60 * 60 * 1000)) * 100) / 100,
      sources: Array.isArray(doc.sources) ? doc.sources : [],
      syncError: doc.syncError || '',
      rates: {
        vatRate: Number(doc.vatRate || 0),
        incomeTaxRate: Number(doc.incomeTaxRate || 0),
        corporateTaxRate: Number(doc.corporateTaxRate || 0),
      },
    };
  });

  const totals = items.reduce(
    (acc, item) => {
      if (item.lastSyncedAt) acc.syncedCountries += 1;
      acc[item.syncStatus] += 1;
      return acc;
    },
    {
      configuredCountries: countries.length,
      syncedCountries: 0,
      ok: 0,
      warning: 0,
      error: 0,
    }
  );

  return {
    generatedAt: nowIso(),
    staleAfterHours: Math.round((staleAfterMs / (60 * 60 * 1000)) * 100) / 100,
    countries: items,
    totals,
  };
}

export async function syncTaxSnapshotForCountry(country?: string): Promise<ExternalTaxSnapshot> {
  const countryCode = normalizeCountry(country);
  const intervalMs = parseIntervalMs();
  const syncedAt = nowIso();
  const nextSyncAt = new Date(Date.now() + intervalMs).toISOString();

  try {
    const snapshot = await getExternalTaxSnapshot(countryCode);

    await TaxRateSnapshot.findOneAndUpdate(
      { countryCode },
      {
        _id: countryCode,
        countryCode,
        vatRate: snapshot.vatRate,
        incomeTaxRate: snapshot.incomeTaxRate,
        corporateTaxRate: snapshot.corporateTaxRate,
        exchangeRateEurUsd: snapshot.exchangeRateEurUsd,
        sources: snapshot.sources,
        syncStatus: 'ok',
        syncError: '',
        lastSyncedAt: syncedAt,
        nextSyncAt,
        updatedAt: syncedAt,
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    return snapshot;
  } catch (error: any) {
    const message = error?.message || 'Unknown tax sync error';

    await TaxRateSnapshot.findOneAndUpdate(
      { countryCode },
      {
        _id: countryCode,
        countryCode,
        syncStatus: 'error',
        syncError: message,
        updatedAt: syncedAt,
        nextSyncAt,
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    throw error;
  }
}

export async function getTaxSnapshotForCountry(country?: string): Promise<ExternalTaxSnapshot> {
  const countryCode = normalizeCountry(country);
  const staleAfterMs = parseStaleAfterMs();

  const doc = await TaxRateSnapshot.findOne({ countryCode });
  if (doc?.lastSyncedAt) {
    const ageMs = Date.now() - new Date(doc.lastSyncedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= staleAfterMs) {
      return snapshotFromDoc(doc.toJSON() as ITaxRateSnapshot);
    }
  }

  try {
    return await syncTaxSnapshotForCountry(countryCode);
  } catch {
    if (doc) return snapshotFromDoc(doc.toJSON() as ITaxRateSnapshot);
    return getExternalTaxSnapshot(countryCode);
  }
}

export async function syncTaxSnapshotsForCountries(countries: string[]): Promise<void> {
  for (const country of countries) {
    try {
      await syncTaxSnapshotForCountry(country);
    } catch (error: any) {
      console.warn(`[taxRateSync] Failed country ${country}:`, error?.message || error);
    }
  }
}

export function startTaxRateSyncWorker(): void {
  if (workerRunning) return;
  workerRunning = true;

  const countries = parseCountriesFromEnv();
  const intervalMs = parseIntervalMs();

  void syncTaxSnapshotsForCountries(countries);

  setInterval(() => {
    void syncTaxSnapshotsForCountries(countries);
  }, intervalMs);
}
