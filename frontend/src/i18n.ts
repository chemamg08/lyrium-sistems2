import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import es from './i18n/es.json';
import en from './i18n/en.json';
import pt from './i18n/pt.json';
import fr from './i18n/fr.json';
import de from './i18n/de.json';
import it from './i18n/it.json';
import nl from './i18n/nl.json';
import pl from './i18n/pl.json';
import sv from './i18n/sv.json';
import no from './i18n/no.json';
import da from './i18n/da.json';
import fi from './i18n/fi.json';
import el from './i18n/el.json';
import cs from './i18n/cs.json';
import hu from './i18n/hu.json';
import ro from './i18n/ro.json';
import bg from './i18n/bg.json';
import hr from './i18n/hr.json';
import sk from './i18n/sk.json';
import sl from './i18n/sl.json';
import lt from './i18n/lt.json';
import lv from './i18n/lv.json';
import et from './i18n/et.json';

// Map from uppercase country code → language code
const COUNTRY_LANGUAGE_MAP: Record<string, string> = {
  // Spanish
  ES: 'es', AD: 'es', MX: 'es', AR: 'es', CO: 'es',
  UY: 'es', PA: 'es', DO: 'es', CL: 'es', PE: 'es',
  EC: 'es', BO: 'es', PY: 'es', CR: 'es',
  GT: 'es', HN: 'es', SV: 'es', NI: 'es',
  // English
  GB: 'en', AU: 'en', CA: 'en', IE: 'en', MT: 'en', CY: 'en', US: 'en',
  NZ: 'en', SG: 'en',
  // Portuguese
  PT: 'pt', BR: 'pt',
  // French
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr',
  // German
  DE: 'de', AT: 'de', LI: 'de',
  // Others
  IT: 'it',
  NL: 'nl',
  PL: 'pl',
  SE: 'sv',
  NO: 'no',
  DK: 'da',
  FI: 'fi',
  GR: 'el',
  CZ: 'cs',
  HU: 'hu',
  RO: 'ro',
  BG: 'bg',
  HR: 'hr',
  SK: 'sk',
  SI: 'sl',
  LT: 'lt',
  LV: 'lv',
  EE: 'et',
  CH: 'de',
};

export function getLanguageForCountry(countryCode: string): string {
  return COUNTRY_LANGUAGE_MAP[countryCode?.toUpperCase()] ?? 'es';
}

// ── Currency system ──

interface CurrencyInfo {
  code: string;
  symbol: string;
  rate: number; // 1 EUR = X local
  position: 'before' | 'after';
}

const CURRENCY_MAP: Record<string, CurrencyInfo> = {
  EUR: { code: 'EUR', symbol: '€', rate: 1, position: 'after' },
  USD: { code: 'USD', symbol: '$', rate: 1.08, position: 'before' },
  GBP: { code: 'GBP', symbol: '£', rate: 0.86, position: 'before' },
  PLN: { code: 'PLN', symbol: 'zł', rate: 4.32, position: 'after' },
  SEK: { code: 'SEK', symbol: 'kr', rate: 11.20, position: 'after' },
  NOK: { code: 'NOK', symbol: 'kr', rate: 11.50, position: 'after' },
  DKK: { code: 'DKK', symbol: 'kr', rate: 7.46, position: 'after' },
  CZK: { code: 'CZK', symbol: 'Kč', rate: 25.30, position: 'after' },
  HUF: { code: 'HUF', symbol: 'Ft', rate: 395, position: 'after' },
  RON: { code: 'RON', symbol: 'lei', rate: 4.97, position: 'after' },
  BGN: { code: 'BGN', symbol: 'лв', rate: 1.96, position: 'after' },
  HRK: { code: 'HRK', symbol: '€', rate: 1, position: 'after' }, // Croatia uses EUR since 2023
  CHF: { code: 'CHF', symbol: 'CHF', rate: 0.94, position: 'before' },
  BRL: { code: 'BRL', symbol: 'R$', rate: 5.50, position: 'before' },
  MXN: { code: 'MXN', symbol: '$', rate: 18.50, position: 'before' },
  ARS: { code: 'ARS', symbol: '$', rate: 950, position: 'before' },
  CLP: { code: 'CLP', symbol: '$', rate: 1020, position: 'before' },
  COP: { code: 'COP', symbol: '$', rate: 4300, position: 'before' },
  PEN: { code: 'PEN', symbol: 'S/', rate: 4.05, position: 'before' },
  UYU: { code: 'UYU', symbol: '$U', rate: 42, position: 'before' },
  AUD: { code: 'AUD', symbol: 'A$', rate: 1.65, position: 'before' },
  NZD: { code: 'NZD', symbol: 'NZ$', rate: 1.78, position: 'before' },
  CAD: { code: 'CAD', symbol: 'C$', rate: 1.47, position: 'before' },
  SGD: { code: 'SGD', symbol: 'S$', rate: 1.45, position: 'before' },
};

const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  // Eurozone
  ES: 'EUR', AD: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', PT: 'EUR',
  NL: 'EUR', BE: 'EUR', LU: 'EUR', AT: 'EUR', FI: 'EUR', IE: 'EUR',
  GR: 'EUR', MT: 'EUR', CY: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR',
  LV: 'EUR', LT: 'EUR', HR: 'EUR', MC: 'EUR', LI: 'EUR',
  // Non-euro
  GB: 'GBP', US: 'USD', PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', CH: 'CHF',
  // Americas
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP',
  PE: 'PEN', UY: 'UYU', PA: 'USD', DO: 'USD', EC: 'USD',
  BO: 'USD', PY: 'USD', CR: 'USD', GT: 'USD', HN: 'USD',
  SV: 'USD', NI: 'USD',
  // Others
  AU: 'AUD', NZ: 'NZD', CA: 'CAD', SG: 'SGD',
};

export function getCurrencyForCountry(countryCode: string): CurrencyInfo {
  const currCode = COUNTRY_CURRENCY_MAP[countryCode?.toUpperCase()] ?? 'EUR';
  return CURRENCY_MAP[currCode] ?? CURRENCY_MAP.EUR;
}

export function formatPrice(eurPrice: number, currency: CurrencyInfo): string {
  const converted = Math.round(eurPrice * currency.rate);
  const formatted = converted.toLocaleString('en-US');
  if (currency.position === 'before') {
    return `${currency.symbol}${formatted}`;
  }
  return `${formatted} ${currency.symbol}`;
}

// Country labels for the selector
export const COUNTRIES_LIST: { code: string; flag: string; name: string }[] = [
  { code: 'ES', flag: '🇪🇸', name: 'España' },
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'DE', flag: '🇩🇪', name: 'Deutschland' },
  { code: 'IT', flag: '🇮🇹', name: 'Italia' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: 'NL', flag: '🇳🇱', name: 'Nederland' },
  { code: 'BE', flag: '🇧🇪', name: 'Belgique' },
  { code: 'AT', flag: '🇦🇹', name: 'Österreich' },
  { code: 'CH', flag: '🇨🇭', name: 'Schweiz' },
  { code: 'PL', flag: '🇵🇱', name: 'Polska' },
  { code: 'SE', flag: '🇸🇪', name: 'Sverige' },
  { code: 'NO', flag: '🇳🇴', name: 'Norge' },
  { code: 'DK', flag: '🇩🇰', name: 'Danmark' },
  { code: 'FI', flag: '🇫🇮', name: 'Suomi' },
  { code: 'IE', flag: '🇮🇪', name: 'Ireland' },
  { code: 'GR', flag: '🇬🇷', name: 'Ελλάδα' },
  { code: 'CZ', flag: '🇨🇿', name: 'Česko' },
  { code: 'HU', flag: '🇭🇺', name: 'Magyarország' },
  { code: 'RO', flag: '🇷🇴', name: 'România' },
  { code: 'BG', flag: '🇧🇬', name: 'България' },
  { code: 'HR', flag: '🇭🇷', name: 'Hrvatska' },
  { code: 'SK', flag: '🇸🇰', name: 'Slovensko' },
  { code: 'SI', flag: '🇸🇮', name: 'Slovenija' },
  { code: 'LT', flag: '🇱🇹', name: 'Lietuva' },
  { code: 'LV', flag: '🇱🇻', name: 'Latvija' },
  { code: 'EE', flag: '🇪🇪', name: 'Eesti' },
  { code: 'MT', flag: '🇲🇹', name: 'Malta' },
  { code: 'CY', flag: '🇨🇾', name: 'Cyprus' },
  { code: 'LU', flag: '🇱🇺', name: 'Luxembourg' },
  { code: 'MX', flag: '🇲🇽', name: 'México' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: 'CO', flag: '🇨🇴', name: 'Colombia' },
  { code: 'CL', flag: '🇨🇱', name: 'Chile' },
  { code: 'PE', flag: '🇵🇪', name: 'Perú' },
  { code: 'BR', flag: '🇧🇷', name: 'Brasil' },
  { code: 'UY', flag: '🇺🇾', name: 'Uruguay' },
  { code: 'EC', flag: '🇪🇨', name: 'Ecuador' },
  { code: 'DO', flag: '🇩🇴', name: 'Rep. Dominicana' },
  { code: 'PA', flag: '🇵🇦', name: 'Panamá' },
  { code: 'CR', flag: '🇨🇷', name: 'Costa Rica' },
  { code: 'GT', flag: '🇬🇹', name: 'Guatemala' },
  { code: 'BO', flag: '🇧🇴', name: 'Bolivia' },
  { code: 'PY', flag: '🇵🇾', name: 'Paraguay' },
  { code: 'HN', flag: '🇭🇳', name: 'Honduras' },
  { code: 'SV', flag: '🇸🇻', name: 'El Salvador' },
  { code: 'NI', flag: '🇳🇮', name: 'Nicaragua' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: 'AD', flag: '🇦🇩', name: 'Andorra' },
  { code: 'MC', flag: '🇲🇨', name: 'Monaco' },
  { code: 'LI', flag: '🇱🇮', name: 'Liechtenstein' },
];

// If ?lang= param is present in the URL, persist it to localStorage so the
// language selector reflects it and subsequent navigation keeps the chosen language.
const _validLangs = ['es','en','pt','fr','de','it','nl','pl','sv','no','da','fi','el','cs','hu','ro','bg','hr','sk','sl','lt','lv','et'];
const _urlLang = new URLSearchParams(window.location.search).get('lang');
if (_urlLang && _validLangs.includes(_urlLang)) {
  localStorage.setItem('appLanguage', _urlLang);
}

i18next
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      pt: { translation: pt },
      fr: { translation: fr },
      de: { translation: de },
      it: { translation: it },
      nl: { translation: nl },
      pl: { translation: pl },
      sv: { translation: sv },
      no: { translation: no },
      da: { translation: da },
      fi: { translation: fi },
      el: { translation: el },
      cs: { translation: cs },
      hu: { translation: hu },
      ro: { translation: ro },
      bg: { translation: bg },
      hr: { translation: hr },
      sk: { translation: sk },
      sl: { translation: sl },
      lt: { translation: lt },
      lv: { translation: lv },
      et: { translation: et },
    },
    lng: localStorage.getItem('appLanguage') ?? getLanguageForCountry(sessionStorage.getItem('country') ?? 'ES'),
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18next;
