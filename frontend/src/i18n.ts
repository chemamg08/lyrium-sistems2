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
