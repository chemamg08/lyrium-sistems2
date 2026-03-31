// VAT / IVA rates by country code (standard rates for digital services)
// Source: EU VAT Directive + non-EU standard rates

const VAT_RATES: Record<string, number> = {
  // EU Member States
  AT: 20,   // Austria
  BE: 21,   // Belgium
  BG: 20,   // Bulgaria
  HR: 25,   // Croatia
  CY: 19,   // Cyprus
  CZ: 21,   // Czech Republic
  DK: 25,   // Denmark
  EE: 22,   // Estonia
  FI: 25.5, // Finland
  FR: 20,   // France
  DE: 19,   // Germany
  GR: 24,   // Greece
  HU: 27,   // Hungary
  IE: 23,   // Ireland
  IT: 22,   // Italy
  LV: 21,   // Latvia
  LT: 21,   // Lithuania
  LU: 17,   // Luxembourg
  MT: 18,   // Malta
  NL: 21,   // Netherlands
  PL: 23,   // Poland
  PT: 23,   // Portugal
  RO: 19,   // Romania
  SK: 23,   // Slovakia
  SI: 22,   // Slovenia
  ES: 21,   // Spain
  SE: 25,   // Sweden

  // EEA / Non-EU Europe
  NO: 25,   // Norway
  CH: 8.1,  // Switzerland
  GB: 20,   // United Kingdom
  IS: 24,   // Iceland
  LI: 8.1,  // Liechtenstein
  AD: 4.5,  // Andorra (IGI)
  MC: 20,   // Monaco (same as France)

  // Americas
  US: 0,    // No federal VAT
  CA: 0,    // GST varies by province, not applied here
  MX: 16,
  BR: 0,    // Complex tax structure
  AR: 21,
  CL: 19,
  CO: 19,
  PE: 18,
  UY: 22,
  EC: 15,   // Ecuador (IVA)
  DO: 18,   // Dominican Republic (ITBIS)
  PA: 7,    // Panama (ITBMS)
  CR: 13,   // Costa Rica (IVA)
  GT: 12,   // Guatemala (IVA)
  BO: 13,   // Bolivia (IVA)
  PY: 10,   // Paraguay (IVA)
  HN: 15,   // Honduras (ISV)
  SV: 13,   // El Salvador (IVA)
  NI: 15,   // Nicaragua (IVA)

  // Asia-Pacific
  AU: 10,
  NZ: 15,
  JP: 10,
  SG: 9,
  IN: 18,
  KR: 10,
  CN: 13,

  // Middle East / Africa
  AE: 5,
  SA: 15,
  ZA: 15,
  IL: 17,
  TR: 20,
};

/**
 * Get the VAT rate for a country.
 * Returns 0 if the country is unknown.
 */
export function getVatRate(countryCode: string): number {
  return VAT_RATES[countryCode.toUpperCase()] ?? 0;
}

/**
 * Get the localized name for the tax (IVA, VAT, TVA, MwSt, etc.)
 */
export function getTaxLabel(countryCode: string): string {
  const code = countryCode.toUpperCase();
  const ivaCountries = ['ES', 'IT', 'PT', 'AR', 'CL', 'CO', 'MX', 'PE', 'UY', 'EC', 'CR', 'GT', 'BO', 'PY', 'SV', 'NI'];
  const tvaCountries = ['FR', 'BE', 'LU', 'RO'];
  const mwstCountries = ['DE', 'AT', 'CH', 'LI'];
  const momsCountries = ['DK', 'SE', 'NO'];
  const alvCountries = ['FI'];
  const fpaCountries = ['GR', 'CY'];
  const gstCountries = ['AU', 'NZ', 'SG', 'IN', 'CA'];

  if (ivaCountries.includes(code)) return 'IVA';
  if (tvaCountries.includes(code)) return 'TVA';
  if (mwstCountries.includes(code)) return 'MwSt';
  if (momsCountries.includes(code)) return 'MOMS';
  if (alvCountries.includes(code)) return 'ALV';
  if (fpaCountries.includes(code)) return 'ΦΠΑ';
  if (gstCountries.includes(code)) return 'GST';
  if (code === 'AD') return 'IGI';
  if (code === 'DO') return 'ITBIS';
  if (code === 'PA') return 'ITBMS';
  if (code === 'HN') return 'ISV';
  if (code === 'BR') return 'ICMS';
  if (code === 'JP') return '消費税';
  if (code === 'KR') return 'VAT';
  if (code === 'HU') return 'ÁFA';
  if (code === 'PL' || code === 'CZ' || code === 'SK') return 'DPH';
  if (code === 'HR' || code === 'SI') return 'PDV';
  if (code === 'BG') return 'ДДС';
  if (code === 'LT' || code === 'LV' || code === 'EE') return 'PVM';
  return 'VAT';
}
