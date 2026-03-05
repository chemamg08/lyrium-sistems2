import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_ROOT = path.join(__dirname, '../..');
const LEYES_DIR = path.join(BACKEND_ROOT, 'leyes');
const OUTPUT_DIR = path.join(BACKEND_ROOT, 'legal_knowledge');

interface Chunk {
  id: string;
  title: string;
  specialties: string[];  // Multi-especialidad
  keywords: string[];
  source: string;
  text: string;
}

interface StructuredArticle {
  id: string;
  norma: string;
  libro: string;
  titulo: string;
  capitulo: string;
  articulo: string;
  source: string;
  specialties: string[];  // Multi-especialidad
  keywords: string[];
  text: string;
}

interface CountryKnowledge {
  country: string;
  name: string;
  updatedAt: string;
  version: string;
  chunks: Chunk[];
  articles: StructuredArticle[];
}

interface ParsedLegalStructure {
  norma: string;
  baseSpecialties: string[];  // Especialidades base del documento
  articles: StructuredArticle[];
}

const COUNTRY_NAMES: Record<string, string> = {
  es: 'España',
  at: 'Austria',
  au: 'Australia',
  ca: 'Canadá',
  ch: 'Suiza',
  cy: 'Chipre',
  cz: 'República Checa',
  de: 'Alemania',
  dk: 'Dinamarca',
  fi: 'Finlandia',
  fr: 'Francia',
  hr: 'Croacia',
  hu: 'Hungría',
  ie: 'Irlanda',
  it: 'Italia',
  lu: 'Luxemburgo',
  lv: 'Letonia',
  mt: 'Malta',
  nl: 'Países Bajos',
  no: 'Noruega',
  pl: 'Polonia',
  pt: 'Portugal',
  ro: 'Rumanía',
  se: 'Suecia',
  sk: 'Eslovaquia'
};

// =============================================================================
// MAPA BOE → ESPECIALIDADES (fuente de verdad para PDFs conocidos)
// =============================================================================
const BOE_SPECIALTY_MAP: Record<string, string[]> = {
  // Penal
  'BOE-A-1995-25444': ['Penal'],                    // Código Penal
  'BOE-A-1882-6036': ['Penal'],                     // LECrim
  
  // Civil
  'BOE-A-1889-4763': ['Civil'],                     // Código Civil
  'BOE-A-2000-323': ['Civil'],                      // LEC
  'BOE-A-1946-2453': ['Civil'],                     // Ley Hipotecaria
  
  // Laboral
  'BOE-A-2015-11430': ['Laboral'],                  // Estatuto Trabajadores
  'BOE-A-2011-15936': ['Laboral'],                  // Ley Jurisdicción Social
  
  // Mercantil
  'BOE-A-2010-10544': ['Mercantil'],                // Ley Sociedades Capital
  'BOE-A-1885-6627': ['Mercantil'],                 // Código de Comercio (si existe)
  
  // Fiscal/Tributario
  'BOE-A-2003-23186': ['Fiscal/Tributario'],        // Ley General Tributaria
  'BOE-A-2006-20764': ['Fiscal/Tributario'],        // Ley IRPF
  'BOE-A-1992-28740': ['Fiscal/Tributario'],        // Ley IVA
  'BOE-A-2014-12328': ['Fiscal/Tributario'],        // Ley Impuesto Sociedades
  
  // Administrativo
  'BOE-A-2015-10565': ['Administrativo'],           // Ley Procedimiento Administrativo
  'BOE-A-2015-10566': ['Administrativo'],           // Ley Régimen Jurídico Sector Público
  
  // Contencioso-Administrativo
  'BOE-A-1998-16718': ['Contencioso-Administrativo'], // LJCA
  
  // Inmobiliario/Arrendamientos
  'BOE-A-1994-26003': ['Inmobiliario/Arrendamientos'], // LAU
  'BOE-A-1960-10906': ['Inmobiliario/Arrendamientos'], // Ley Propiedad Horizontal
  
  // Constitucional
  'BOE-A-1978-31229': ['Administrativo'],           // Constitución
  'BOE-A-1985-12666': ['Administrativo'],           // LOPJ
  
  // Protección de Datos
  'BOE-A-2018-16673': ['Protección de Datos y Compliance'], // LOPDGDD
  'CELEX_32016R0679': ['Protección de Datos y Compliance'], // RGPD
  
  // Concursal
  'BOE-A-2020-4859': ['Mercantil'],                 // Ley Concursal
  'BOE-A-2007-20555': ['Mercantil'],                // Ley Defensa Competencia
};

// =============================================================================
// MAPA NOMBRE LEY → ESPECIALIDADES (fallback para PDFs sin BOE conocido)
// =============================================================================
const LAW_NAME_SPECIALTY_MAP: Array<{ patterns: string[]; specialties: string[] }> = [
  // Penal
  { patterns: ['código penal', 'ley orgánica 10/1995'], specialties: ['Penal'] },
  { patterns: ['enjuiciamiento criminal', 'lecrim'], specialties: ['Penal'] },
  
  // Civil
  { patterns: ['código civil'], specialties: ['Civil'] },
  { patterns: ['enjuiciamiento civil', 'lec '], specialties: ['Civil'] },
  { patterns: ['ley hipotecaria'], specialties: ['Civil', 'Inmobiliario/Arrendamientos'] },
  
  // Laboral
  { patterns: ['estatuto de los trabajadores', 'estatuto trabajadores'], specialties: ['Laboral'] },
  { patterns: ['jurisdicción social', 'procedimiento laboral'], specialties: ['Laboral'] },
  
  // Mercantil
  { patterns: ['sociedades de capital', 'ley de sociedades'], specialties: ['Mercantil'] },
  { patterns: ['código de comercio'], specialties: ['Mercantil'] },
  { patterns: ['ley concursal', 'concurso de acreedores'], specialties: ['Mercantil'] },
  
  // Fiscal
  { patterns: ['ley general tributaria', 'lgt'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['impuesto sobre la renta', 'irpf'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['impuesto sobre el valor añadido', 'ley del iva'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['impuesto sobre sociedades'], specialties: ['Fiscal/Tributario'] },
  
  // Administrativo
  { patterns: ['procedimiento administrativo', 'ley 39/2015'], specialties: ['Administrativo'] },
  { patterns: ['régimen jurídico del sector público', 'ley 40/2015'], specialties: ['Administrativo'] },
  { patterns: ['constitución española'], specialties: ['Administrativo'] },
  
  // Contencioso
  { patterns: ['jurisdicción contencioso', 'contencioso-administrativ'], specialties: ['Contencioso-Administrativo'] },
  
  // Inmobiliario
  { patterns: ['arrendamientos urbanos', 'lau'], specialties: ['Inmobiliario/Arrendamientos'] },
  { patterns: ['propiedad horizontal'], specialties: ['Inmobiliario/Arrendamientos'] },
  
  // Protección de Datos
  { patterns: ['protección de datos', 'lopdgdd', 'rgpd', 'reglamento general de protección'], specialties: ['Protección de Datos y Compliance'] },

  // === Alemán (DE, AT, CH) ===
  { patterns: ['strafgesetzbuch', 'stgb', 'strafprozessordnung'], specialties: ['Penal'] },
  { patterns: ['bürgerliches gesetzbuch', 'bgb', 'zivilprozessordnung', 'zivilgesetzbuch', 'zgb', 'obligationenrecht'], specialties: ['Civil'] },
  { patterns: ['handelsgesetzbuch', 'hgb', 'aktiengesetz', 'aktg', 'gmbh-gesetz', 'insolvenzordnung', 'aktiengesellschaft'], specialties: ['Mercantil'] },
  { patterns: ['einkommensteuergesetz', 'estg', 'umsatzsteuergesetz', 'ustg', 'abgabenordnung', 'mehrwertsteuergesetz', 'steuergesetzbuch'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['arbeitsgesetzbuch', 'kündigungsschutzgesetz', 'tarifvertragsgesetz', 'arbeitnehmerüberlassung', 'arbeitnehmer'], specialties: ['Laboral'] },
  { patterns: ['verwaltungsverfahrensgesetz', 'verwaltungsgericht', 'bundesverwaltung'], specialties: ['Administrativo'] },
  { patterns: ['datenschutzgrundverordnung', 'dsgvo', 'bundesdatenschutzgesetz', 'bdsg', 'datenschutzgesetz'], specialties: ['Protección de Datos y Compliance'] },
  { patterns: ['mietrecht', 'wohnraummiete', 'mietgesetz', 'wohnungseigentumsgesetz', 'wohneigentum'], specialties: ['Inmobiliario/Arrendamientos'] },

  // === Francés (FR, LU, CH) ===
  { patterns: ['code pénal', 'code penal', 'code de procédure pénale', 'code de procedure penale'], specialties: ['Penal'] },
  { patterns: ['code civil', 'code de procédure civile', 'code de procedure civile', 'nouveau code de procédure civile'], specialties: ['Civil'] },
  { patterns: ['code du travail', 'droit du travail'], specialties: ['Laboral'] },
  { patterns: ['code de commerce', 'droit des sociétés', 'droit des societes'], specialties: ['Mercantil'] },
  { patterns: ['code général des impôts', 'code general des impots', "loi sur l'impôt", 'impôt sur le revenu', 'taxe sur la valeur ajoutée', 'tva loi'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['code de la protection des données', 'protection des données personnelles', 'cnpd'], specialties: ['Protección de Datos y Compliance'] },
  { patterns: ['bail d\'habitation', 'loyer', 'arrendamiento locatif', 'code des baux', 'location immobilière'], specialties: ['Inmobiliario/Arrendamientos'] },
  { patterns: ['contentieux administratif', 'droit administratif', 'tribunal administratif'], specialties: ['Contencioso-Administrativo'] },

  // === Inglés (IE, AU, CA, MT, CY) ===
  { patterns: ['criminal code', 'penal code', 'crimes act', 'criminal justice act', 'criminal law act', 'criminal procedure'], specialties: ['Penal'] },
  { patterns: ['civil procedure', 'rules of civil procedure', 'civil code', 'civil liability act'], specialties: ['Civil'] },
  { patterns: ['companies act', 'corporations act', 'financial services act', 'business corporations act', 'limited liability'], specialties: ['Mercantil'] },
  { patterns: ['income tax act', 'tax consolidation act', 'income tax', 'value added tax', 'vat act', 'excise tax act', 'taxation act'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['employment act', 'employment rights', 'fair work act', 'industrial relations act', 'national employment standards', 'unfair dismissal', 'employment standards act'], specialties: ['Laboral'] },
  { patterns: ['data protection act', 'privacy act', 'personal information protection', 'pipeda'], specialties: ['Protección de Datos y Compliance'] },
  { patterns: ['landlord and tenant', 'residential tenancies act', 'land law', 'conveyancing act', 'real property act'], specialties: ['Inmobiliario/Arrendamientos'] },
  { patterns: ['administrative decisions', 'administrative tribunal', 'judicial review act', 'administrative appeals'], specialties: ['Contencioso-Administrativo'] },

  // === Italiano (IT) ===
  { patterns: ['codice penale', 'codice di procedura penale'], specialties: ['Penal'] },
  { patterns: ['codice civile', 'codice di procedura civile'], specialties: ['Civil'] },
  { patterns: ['statuto dei lavoratori', 'jobs act', 'codice del lavoro', 'contratto di lavoro'], specialties: ['Laboral'] },
  { patterns: ['codice delle società', 'diritto societario', 'codice del commercio'], specialties: ['Mercantil'] },
  { patterns: ['testo unico delle imposte', 'tuir', 'imposta sul reddito', 'iva codice', 'legge di bilancio'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['codice in materia di protezione dei dati', 'privacy codice'], specialties: ['Protección de Datos y Compliance'] },

  // === Portugués (PT) ===
  { patterns: ['código penal português', 'codigo penal', 'código de processo penal', 'processo penal'], specialties: ['Penal'] },
  { patterns: ['código civil português', 'codigo civil', 'código de processo civil', 'processo civil'], specialties: ['Civil'] },
  { patterns: ['código do trabalho', 'codigo do trabalho', 'lei do trabalho portugal'], specialties: ['Laboral'] },
  { patterns: ['código das sociedades comerciais', 'direito societário', 'insolvência'], specialties: ['Mercantil'] },
  { patterns: ['código do irs', 'código do irc', 'código do iva', 'irs código', 'irc portugal', 'iva portugal', 'lei geral tributária'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['lei de proteção de dados pessoais', 'proteção de dados portugal'], specialties: ['Protección de Datos y Compliance'] },
  { patterns: ['regime do arrendamento urbano', 'arrendamento urbano', 'arrendamento portugal'], specialties: ['Inmobiliario/Arrendamientos'] },

  // === Neerlandés (NL) ===
  { patterns: ['wetboek van strafrecht', 'wetboek van strafvordering'], specialties: ['Penal'] },
  { patterns: ['burgerlijk wetboek', 'wetboek van burgerlijke rechtsvordering'], specialties: ['Civil'] },
  { patterns: ['arbeidsrecht', 'wet werk en zekerheid', 'arbeidsovereenkomst'], specialties: ['Laboral'] },
  { patterns: ['wetboek van koophandel', 'handelsrecht nederland'], specialties: ['Mercantil'] },
  { patterns: ['wet inkomstenbelasting', 'belastingwet', 'wet vennootschapsbelasting', 'omzetbelasting'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['wet bescherming persoonsgegevens', 'avg'], specialties: ['Protección de Datos y Compliance'] },
  { patterns: ['huurrecht', 'huurwet', 'woninghuurwet'], specialties: ['Inmobiliario/Arrendamientos'] },

  // === Sueco (SE) ===
  { patterns: ['brottsbalken', 'rättegångsbalk', 'brottsbalk'], specialties: ['Penal'] },
  { patterns: ['ärvdabalk', 'föräldrabalk', 'jordabalk', 'avtalslagen'], specialties: ['Civil'] },
  { patterns: ['lagen om anställningsskydd', 'arbetsrätt', 'medbestämmandelagen', 'anställningsskydd'], specialties: ['Laboral'] },
  { patterns: ['aktiebolagslag', 'aktiebolagslagen', 'bolagslagen'], specialties: ['Mercantil'] },
  { patterns: ['inkomstskattelag', 'skatteförfarandelag', 'mervärdesskattelag', 'skattelag'], specialties: ['Fiscal/Tributario'] },

  // === Noruego (NO) ===
  { patterns: ['straffeloven', 'straffeprosessloven', 'straffeprosess'], specialties: ['Penal'] },
  { patterns: ['avtaleloven', 'gjeldsbrevloven', 'kjøpsloven', 'tvisteloven'], specialties: ['Civil'] },
  { patterns: ['arbeidsmiljøloven', 'ferieloven', 'arbeidsmiljö'], specialties: ['Laboral'] },
  { patterns: ['skatteloven', 'merverdiavgiftsloven', 'skatteforvaltningsloven'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['personopplysningsloven', 'datatilsyn'], specialties: ['Protección de Datos y Compliance'] },

  // === Danés (DK) ===
  { patterns: ['straffeloven', 'retsplejeloven'], specialties: ['Penal'] },
  { patterns: ['aftaleloven', 'købeloven', 'forældreansvarsloven'], specialties: ['Civil'] },
  { patterns: ['funktionærloven', 'ferieloven', 'ansættelsesbevisloven', 'ansættelsesbrev'], specialties: ['Laboral'] },
  { patterns: ['selskabsloven', 'årsregnskabsloven', 'apselskaber'], specialties: ['Mercantil'] },
  { patterns: ['kildeskatteloven', 'momsloven', 'personskatteloven', 'skatteforvaltningsloven'], specialties: ['Fiscal/Tributario'] },

  // === Finlandés (FI) ===
  { patterns: ['rikoslaki', 'pakkokeinolaki', 'rikosoikeudenkäyntilaki'], specialties: ['Penal'] },
  { patterns: ['oikeudenkäymiskaari', 'siviililaki', 'velkakirjalaki'], specialties: ['Civil'] },
  { patterns: ['työsopimuslaki', 'vuosilomalaki', 'yhteistoimintalaki', 'työlaki'], specialties: ['Laboral'] },
  { patterns: ['osakeyhtiölaki', 'kauppakaari', 'konkurssilaki'], specialties: ['Mercantil'] },
  { patterns: ['tuloverolaki', 'arvonlisäverolaki', 'verotusmenettelylaki', 'verolaki'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['tietosuojalaki', 'henkilötietolaki'], specialties: ['Protección de Datos y Compliance'] },

  // === Polaco (PL) ===
  { patterns: ['kodeks karny', 'kodeks postępowania karnego', 'kodeks wykroczeń'], specialties: ['Penal'] },
  { patterns: ['kodeks cywilny', 'kodeks postępowania cywilnego', 'prawo cywilne'], specialties: ['Civil'] },
  { patterns: ['kodeks pracy', 'prawo pracy', 'ustawa o związkach zawodowych'], specialties: ['Laboral'] },
  { patterns: ['kodeks spółek handlowych', 'prawo upadłościowe', 'handlowe ksh'], specialties: ['Mercantil'] },
  { patterns: ['ordynacja podatkowa', 'ustawa o podatku dochodowym', 'ustawa o vat'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['ustawa o ochronie danych osobowych', 'ochrona danych osobowych', 'rodo'], specialties: ['Protección de Datos y Compliance'] },
  { patterns: ['ustawa o ochronie lokatorów', 'najem lokalu', 'własność lokali'], specialties: ['Inmobiliario/Arrendamientos'] },

  // === Checo (CZ) ===
  { patterns: ['trestní zákoník', 'trestní řád', 'trestní zákon'], specialties: ['Penal'] },
  { patterns: ['občanský zákoník', 'občanský soudní řád', 'nový občanský zákoník'], specialties: ['Civil'] },
  { patterns: ['zákoník práce', 'pracovní právo', 'zákon o zaměstnanosti'], specialties: ['Laboral'] },
  { patterns: ['zákon o obchodních korporacích', 'zákon o obchodních společnostech', 'insolvenční zákon'], specialties: ['Mercantil'] },
  { patterns: ['daňový řád', 'zákon o dani z příjmů', 'zákon o dph', 'zákon o daních'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['zákon o ochraně osobních údajů'], specialties: ['Protección de Datos y Compliance'] },

  // === Eslovaco (SK) ===
  { patterns: ['trestný zákon', 'trestný poriadok', 'trestné právo'], specialties: ['Penal'] },
  { patterns: ['občiansky zákonník', 'občiansky súdny poriadok'], specialties: ['Civil'] },
  { patterns: ['zákonník práce', 'pracovné právo'], specialties: ['Laboral'] },
  { patterns: ['obchodný zákonník', 'zákon o obchodných spoločnostiach'], specialties: ['Mercantil'] },
  { patterns: ['daňový poriadok', 'zákon o dani z príjmov', 'zákon o dph', 'zákon o daniach'], specialties: ['Fiscal/Tributario'] },

  // === Húngaro (HU) ===
  { patterns: ['büntető törvénykönyv', 'btk', 'büntetőeljárásról szóló'], specialties: ['Penal'] },
  { patterns: ['polgári törvénykönyv', 'ptk', 'polgári perrendtartás'], specialties: ['Civil'] },
  { patterns: ['munka törvénykönyve', 'munkatörvény', 'munkajog'], specialties: ['Laboral'] },
  { patterns: ['gazdasági társaságokról', 'cégeljárásról', 'csődbejárásról'], specialties: ['Mercantil'] },
  { patterns: ['adózás rendjéről', 'szja-törvény', 'áfa-törvény', 'társasági adó'], specialties: ['Fiscal/Tributario'] },

  // === Rumano (RO) ===
  { patterns: ['codul penal', 'codul de procedură penală', 'cod penal'], specialties: ['Penal'] },
  { patterns: ['codul civil', 'codul de procedură civilă', 'cod civil'], specialties: ['Civil'] },
  { patterns: ['codul muncii', 'legea dialogului social', 'munca romania'], specialties: ['Laboral'] },
  { patterns: ['legea societăților', 'legea societatilor', 'legea insolvenței'], specialties: ['Mercantil'] },
  { patterns: ['codul fiscal', 'legea nr. 227/2015', 'impozit venit', 'taxa pe valoarea adăugată'], specialties: ['Fiscal/Tributario'] },

  // === Letón (LV) ===
  { patterns: ['krimināllikums', 'kriminālprocesa likums'], specialties: ['Penal'] },
  { patterns: ['civillikums', 'civilprocesa likums'], specialties: ['Civil'] },
  { patterns: ['darba likums', 'darba tiesības'], specialties: ['Laboral'] },
  { patterns: ['komerclikums', 'maksātnespējas likums'], specialties: ['Mercantil'] },
  { patterns: ['nodokļu un nodevu likums', 'pievienotās vērtības nodokļa likums'], specialties: ['Fiscal/Tributario'] },

  // === Croata (HR) ===
  { patterns: ['kazneni zakon', 'zakon o kaznenom postupku', 'prekršajni zakon'], specialties: ['Penal'] },
  { patterns: ['zakon o obveznim odnosima', 'ovršni zakon', 'zakon o parničnom postupku', 'obligacijski zakon'], specialties: ['Civil'] },
  { patterns: ['zakon o radu', 'zakon o tržištu rada', 'radni zakon'], specialties: ['Laboral'] },
  { patterns: ['zakon o trgovačkim društvima', 'stečajni zakon', 'trgovačko pravo'], specialties: ['Mercantil'] },
  { patterns: ['opći porezni zakon', 'zakon o porezu na dohodak', 'zakon o porezu na dodanu vrijednost', 'porezni zakon'], specialties: ['Fiscal/Tributario'] },
  { patterns: ['zakon o zaštiti osobnih podataka', 'zaštita osobnih podataka'], specialties: ['Protección de Datos y Compliance'] },
  { patterns: ['zakon o najmu stanova', 'zakon o vlasništvu', 'najam stanova', 'najam nekretnina'], specialties: ['Inmobiliario/Arrendamientos'] },
  { patterns: ['ustav republike hrvatske', 'ustavni zakon', 'zakon o upravnom postupku'], specialties: ['Administrativo'] },

  // === Maltés (MT) ===
  { patterns: ['kodiċi kriminali', 'criminal code cap.154', 'cap.154'], specialties: ['Penal'] },
  { patterns: ['kodiċi ċivili', 'civil code cap.16'], specialties: ['Civil'] },
  { patterns: ['employment and industrial relations act', 'termination of employment'], specialties: ['Laboral'] },
  { patterns: ['mali u negozju act', 'companies act cap.386'], specialties: ['Mercantil'] },
  { patterns: ['income tax act cap.123', 'value added tax act cap.406'], specialties: ['Fiscal/Tributario'] },

  // === Chipriota (CY) ===
  { patterns: ['criminal code cap.154', 'cap. 154', 'criminal procedure law'], specialties: ['Penal'] },
  { patterns: ['contract law cap.149', 'civil procedure law cap'], specialties: ['Civil'] },
  { patterns: ['termination of employment law', 'social insurance law', 'employment law cy'], specialties: ['Laboral'] },
  { patterns: ['companies law cap.113', 'insolvency cy'], specialties: ['Mercantil'] },
  { patterns: ['income tax law cy', 'assessment and collection of taxes', 'vat law cy'], specialties: ['Fiscal/Tributario'] },
];

// =============================================================================
// KEYWORDS AMPLIADAS (último fallback - detección por contenido)
// =============================================================================
const SPECIALTY_RULES: Array<{ specialty: string; terms: string[]; weight: number }> = [
  { 
    specialty: 'Penal', 
    weight: 1.5,
    terms: [
      'penal', 'delito', 'delitos', 'pena', 'penas', 'prisión', 'multa penal',
      'acusado', 'imputado', 'fiscal', 'ministerio fiscal', 'acusación',
      'prescripción del delito', 'extinción de la responsabilidad',
      'homicidio', 'asesinato', 'lesiones', 'robo', 'hurto', 'estafa',
      'apropiación indebida', 'falsedad', 'cohecho', 'prevaricación',
      'atenuante', 'agravante', 'eximente', 'tentativa', 'conspiración',
      'encubrimiento', 'receptación', 'blanqueo', 'tráfico de drogas'
    ]
  },
  { 
    specialty: 'Fiscal/Tributario',
    weight: 1.3,
    terms: [
      'tribut', 'tributario', 'tributaria', 'impuesto', 'impuestos',
      'iva', 'irpf', 'aeat', 'agencia tributaria', 'hacienda',
      'base imponible', 'hecho imponible', 'cuota tributaria',
      'declaración', 'autoliquidación', 'retención', 'ingreso a cuenta',
      'sanción tributaria', 'infracción tributaria', 'recargo',
      'deducción', 'exención', 'bonificación fiscal', 'tipo impositivo'
    ]
  },
  { 
    specialty: 'Laboral',
    weight: 1.3,
    terms: [
      'laboral', 'trabajador', 'trabajadores', 'empresa', 'empresario',
      'despido', 'despido procedente', 'despido improcedente', 'despido nulo',
      'salario', 'nómina', 'convenio colectivo', 'contrato de trabajo',
      'jornada laboral', 'vacaciones', 'permiso', 'excedencia',
      'seguridad social', 'cotización', 'prestación por desempleo',
      'indemnización por despido', 'finiquito', 'extinción del contrato',
      'modificación sustancial', 'movilidad geográfica', 'ere', 'erte'
    ]
  },
  { 
    specialty: 'Mercantil',
    weight: 1.2,
    terms: [
      'mercantil', 'sociedad', 'sociedades', 'sociedad limitada', 'sociedad anónima',
      'administrador', 'administradores', 'consejo de administración',
      'acciones', 'participaciones', 'capital social', 'junta general',
      'estatutos sociales', 'escritura pública', 'registro mercantil',
      'concurso de acreedores', 'quiebra', 'insolvencia', 'liquidación',
      'fusión', 'escisión', 'transformación societaria', 'dividendo'
    ]
  },
  { 
    specialty: 'Civil',
    weight: 1.0,
    terms: [
      'civil', 'obligaciones', 'contrato', 'contratos', 'responsabilidad civil',
      'daños y perjuicios', 'indemnización', 'incumplimiento contractual',
      'arras', 'cláusula penal', 'resolución del contrato',
      'compraventa', 'donación', 'permuta', 'arrendamiento',
      'propiedad', 'posesión', 'usufructo', 'servidumbre',
      'prescripción', 'caducidad', 'plazos'
    ]
  },
  { 
    specialty: 'Administrativo',
    weight: 1.1,
    terms: [
      'administrativo', 'administración pública', 'administración general',
      'procedimiento administrativo', 'expediente', 'resolución administrativa',
      'recurso de alzada', 'recurso de reposición', 'silencio administrativo',
      'acto administrativo', 'nulidad', 'anulabilidad',
      'sanción administrativa', 'potestad sancionadora',
      'licencia', 'autorización', 'concesión', 'subvención'
    ]
  },
  { 
    specialty: 'Contencioso-Administrativo',
    weight: 1.4,
    terms: [
      'contencioso-administrativo', 'contencioso administrativo',
      'jurisdicción contenciosa', 'recurso contencioso',
      'sala de lo contencioso', 'juzgado contencioso',
      'actividad administrativa impugnable', 'inactividad de la administración'
    ]
  },
  { 
    specialty: 'Familia y Sucesiones',
    weight: 1.3,
    terms: [
      'familia', 'matrimonio', 'divorcio', 'separación', 'nulidad matrimonial',
      'custodia', 'patria potestad', 'régimen de visitas', 'pensión de alimentos',
      'pensión compensatoria', 'liquidación de gananciales',
      'herencia', 'sucesión', 'testamento', 'legítima', 'heredero',
      'legatario', 'partición hereditaria', 'aceptación de herencia'
    ]
  },
  { 
    specialty: 'Inmobiliario/Arrendamientos',
    weight: 1.2,
    terms: [
      'inmobiliario', 'inmueble', 'finca', 'vivienda', 'local',
      'arrendamiento', 'arrendador', 'arrendatario', 'alquiler', 'renta',
      'fianza', 'depósito', 'prórroga', 'desahucio', 'lanzamiento',
      'propiedad horizontal', 'comunidad de propietarios', 'cuota de participación',
      'hipoteca', 'préstamo hipotecario', 'ejecución hipotecaria'
    ]
  },
  { 
    specialty: 'Protección de Datos y Compliance',
    weight: 1.4,
    terms: [
      'rgpd', 'lopdgdd', 'protección de datos', 'datos personales',
      'tratamiento de datos', 'responsable del tratamiento', 'encargado del tratamiento',
      'consentimiento', 'base jurídica', 'interés legítimo',
      'delegado de protección de datos', 'dpd', 'dpo',
      'transferencia internacional', 'violación de seguridad', 'brecha de datos',
      'compliance', 'cumplimiento normativo', 'programa de cumplimiento'
    ]
  }
];

const STOPWORDS = new Set([
  'para', 'como', 'esta', 'este', 'estos', 'estas', 'sobre', 'entre', 'donde', 'cuando', 'desde',
  'hasta', 'porque', 'tambien', 'ser', 'estar', 'haber', 'tiene', 'tener', 'debe', 'puede', 'solo',
  'del', 'las', 'los', 'una', 'unos', 'unas', 'por', 'con', 'sin', 'que', 'sus', 'han', 'fue', 'son',
  'ley', 'artículo', 'articulos', 'capítulo', 'titulo', 'boe'
]);

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const stripInlinePageMarkers = (value: string): string =>
  value.replace(/\s*--\s*\d+\s+of\s+\d+\s*--\s*/gi, ' ');

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const getPdfFilesRecursive = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await getPdfFilesRecursive(fullPath);
      files.push(...nested);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      files.push(fullPath);
    }
  }

  return files;
};

/**
 * Busca recursivamente archivos .json de texto plano (leyes en formato texto, e.g. HR)
 * Distingue los archivos de knowledge de salida por su ruta
 */
const getPlaintextFilesRecursive = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await getPlaintextFilesRecursive(fullPath);
      files.push(...nested);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
};

/**
 * Lee un archivo .json de texto plano (no JSON estructurado), stripeando el prefijo '{}' si existe
 */
const extractPlaintextText = async (filePath: string): Promise<string> => {
  const raw = await fs.readFile(filePath, 'utf-8');
  // Algunos archivos HR tienen '{}' como primera línea — eliminarlo
  return raw.replace(/^\s*\{\s*\}\s*\n?/, '').trim();
};

/**
 * Limpia texto plano (sin necesidad del pipeline de limpieza PDF)
 */
const cleanPlainText = (text: string): string => {
  return stripInlinePageMarkers(text)
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const extractPdfText = async (buffer: Buffer): Promise<string> => {
  const pdfParseModule: any = await import('pdf-parse');

  if (typeof pdfParseModule === 'function') {
    const parsed = await pdfParseModule(buffer);
    return parsed?.text || '';
  }

  if (typeof pdfParseModule?.default === 'function') {
    const parsed = await pdfParseModule.default(buffer);
    return parsed?.text || '';
  }

  if (typeof pdfParseModule?.PDFParse === 'function') {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    const result = await parser.getText();
    return result?.text || '';
  }

  throw new Error('Formato de export no soportado para pdf-parse');
};

// =============================================================================
// DETECCIÓN DE ESPECIALIDADES (sistema jerárquico)
// =============================================================================

/**
 * Extrae el código BOE del nombre del archivo
 * Ej: "BOE-A-1995-25444-consolidado.pdf" → "BOE-A-1995-25444"
 */
const extractBoeCode = (fileName: string): string | null => {
  const match = fileName.match(/^(BOE-A-\d{4}-\d+)/i);
  if (match) return match[1].toUpperCase();
  
  // También soportar CELEX (europea)
  const celexMatch = fileName.match(/^(CELEX[_-][^_.-]+)/i);
  if (celexMatch) return celexMatch[1].replace('-', '_').toUpperCase();
  
  return null;
};

/**
 * Detecta especialidades por código BOE (más preciso)
 */
const detectSpecialtiesByBoe = (fileName: string): string[] | null => {
  const boeCode = extractBoeCode(fileName);
  if (!boeCode) return null;
  
  return BOE_SPECIALTY_MAP[boeCode] || null;
};

/**
 * Detecta especialidades por nombre de ley en el contenido
 */
const detectSpecialtiesByLawName = (text: string, fileName: string): string[] | null => {
  const haystack = normalize(`${fileName} ${text.slice(0, 5000)}`);
  
  for (const rule of LAW_NAME_SPECIALTY_MAP) {
    if (rule.patterns.some(pattern => haystack.includes(pattern))) {
      return rule.specialties;
    }
  }
  
  return null;
};

/**
 * Detecta especialidades por keywords con scoring (fallback)
 */
const detectSpecialtiesByKeywords = (text: string): string[] => {
  const haystack = normalize(text.slice(0, 8000));
  const scores: Record<string, number> = {};
  
  for (const rule of SPECIALTY_RULES) {
    let matchCount = 0;
    for (const term of rule.terms) {
      // Contar ocurrencias, no solo presencia
      const regex = new RegExp(term, 'gi');
      const matches = haystack.match(regex);
      if (matches) {
        matchCount += matches.length;
      }
    }
    
    if (matchCount > 0) {
      scores[rule.specialty] = matchCount * rule.weight;
    }
  }
  
  // Ordenar por score y devolver las top con score significativo
  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, score]) => score >= 2);
  
  if (sorted.length === 0) {
    return ['General'];
  }
  
  // Si el top tiene mucha más puntuación, solo devolver ese
  // Si están cerca, devolver múltiples
  const topScore = sorted[0][1];
  const relevantSpecialties = sorted
    .filter(([_, score]) => score >= topScore * 0.4)
    .map(([specialty]) => specialty);
  
  return relevantSpecialties.length > 0 ? relevantSpecialties : ['General'];
};

/**
 * Detecta especialidades base del documento completo
 * Orden de prioridad: BOE > Nombre de ley > Keywords
 */
const detectDocumentSpecialties = (text: string, fileName: string): string[] => {
  // 1. Intentar por código BOE (más preciso)
  const boeSpecialties = detectSpecialtiesByBoe(fileName);
  if (boeSpecialties) {
    return boeSpecialties;
  }
  
  // 2. Intentar por nombre de ley
  const nameSpecialties = detectSpecialtiesByLawName(text, fileName);
  if (nameSpecialties) {
    return nameSpecialties;
  }
  
  // 3. Fallback a keywords
  return detectSpecialtiesByKeywords(text);
};

/**
 * Detecta especialidades de un artículo específico
 * Combina especialidad base del documento + detección específica del artículo
 */
const detectArticleSpecialties = (
  articleText: string, 
  baseSpecialties: string[]
): string[] => {
  // Si el documento tiene especialidad definida, usarla como base
  if (baseSpecialties.length > 0 && !baseSpecialties.includes('General')) {
    // Detectar si el artículo tiene materia adicional
    const articleSpecialties = detectSpecialtiesByKeywords(articleText);
    
    // Combinar: base + adicionales (sin duplicados)
    const combined = new Set([...baseSpecialties, ...articleSpecialties.filter(s => s !== 'General')]);
    return Array.from(combined);
  }
  
  // Si el documento es General, detectar por artículo
  return detectSpecialtiesByKeywords(articleText);
};

const extractKeywords = (text: string, max = 12): string[] => {
  const words = normalize(text)
    .replace(/[^a-záéíóúñ0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
};

const isNoiseLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed) return true;

  if (
    /^boletín oficial del estado$/i.test(trimmed)
    || /^legislación consolidada$/i.test(trimmed)
    || /^página\s+\d+$/i.test(trimmed)
    || /^índice$/i.test(trimmed)
    || /^texto consolidado$/i.test(trimmed)
    || /^última modificación:/i.test(trimmed)
  ) {
    return true;
  }

  if (/^ref\.\s*boe/i.test(trimmed)) {
    return true;
  }

  if (/\.{4,}\s*\d+\s*$/.test(trimmed)) {
    return true;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    return true;
  }

  if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(trimmed)) {
    return true;
  }

  return false;
};

const isSectionHeadingLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed) return false;

  if (/^(SECCI[ÓO]N|SUBSECCI[ÓO]N|PARTE|DISPOSICI[ÓO]N)\b/i.test(trimmed)) {
    return true;
  }

  if (/^(De|Del|De la|De los|De las)\s+[A-ZÁÉÍÓÚÑ].{2,220}$/.test(trimmed)) {
    if (/[\.;:!?]$/.test(trimmed)) return false;
    return true;
  }

  if (/\bSECCI[ÓO]N\s+\d+/i.test(trimmed) && !/[\.;:!?]$/.test(trimmed)) {
    return true;
  }

  return false;
};

const sanitizeArticleText = (text: string): string => {
  const cleaned = stripInlinePageMarkers(text).replace(/\s+/g, ' ').trim();

  const boundaryRegexes = [
    /\s+(?:LIBRO\s+[IVXLCDM\d].*)$/i,
    /\s+(?:T[ÍI]TULO\s+[IVXLCDM\d].*)$/i,
    /\s+(?:CAP[ÍI]TULO\s+[IVXLCDM\d].*)$/i,
    /\s+(?:SECCI[ÓO]N\s+\d+.*)$/i,
    /\s+(?:De|Del|De la|De los|De las)\s+[^\.]{3,220}\s+SECCI[ÓO]N\s+\d+.*$/i,
    /\s+(?:De|Del|De la|De los|De las)\s+[A-ZÁÉÍÓÚÑ][^.!?\d]{3,180}$/,
    /\s+(?:De|Del|De la|De los|De las)\s+[a-záéíóúñ][^.!?\d]{2,180}$/
  ];

  let result = cleaned;
  for (const regex of boundaryRegexes) {
    result = result.replace(regex, '').trim();
  }

  return result;
};

const cleanPdfText = (text: string, country = ''): string => {
  const normalized = stripInlinePageMarkers(text)
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  const rawLines = normalized
    .split('\n')
    .map((line) => line.replace(/^P[áa]gina\s+\d+\s*/i, '').trim());
  const lines = rawLines.filter((line) => line.length > 0);

  const freq = new Map<string, number>();
  for (const line of lines) {
    const key = normalize(line);
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  const filtered = lines.filter((line) => {
    if (isNoiseLine(line)) return false;

    const key = normalize(line);
    const repeats = freq.get(key) || 0;
    const tooRepeated = repeats >= 8 && key.length < 80;
    if (tooRepeated) return false;

    return true;
  });

  const mergedLines: string[] = [];
  for (const line of filtered) {
    if (mergedLines.length === 0) {
      mergedLines.push(line);
      continue;
    }

    const prev = mergedLines[mergedLines.length - 1];
    const isAuSection = country === 'au' && /^\d+[A-Za-z]* [A-Z]/.test(line);
    const isFiSeSection = (country === 'fi' || country === 'se') && /^\d+[a-z]?\s+§/.test(line);
    const isLvSection = country === 'lv' && /^\d+\.\s*pants\./i.test(line);
    const isHuSection = country === 'hu' && /^\d+:\d+\.\s*§/.test(line);
    const articleHeadingRe = /^(?:LIBRO|T[ÍI]TULO|CAP[ÍI]TULO|Art[íi]culo|Artigo|Articolo|Articolul?|Article|Artikel|Artikkel|Artykuł|Člán|Cikk|Pants|Artikolu|Čla|Section)\b/i;
    const isHeading = isAuSection || isFiSeSection || isLvSection || isHuSection || articleHeadingRe.test(line) || isSectionHeadingLine(line);
    const prevIsAuSection = country === 'au' && /^\d+[A-Za-z]* [A-Z]/.test(prev);
    const prevIsFiSeSection = (country === 'fi' || country === 'se') && /^\d+[a-z]?\s+§/.test(prev);
    const prevIsLvSection = country === 'lv' && /^\d+\.\s*pants\./i.test(prev);
    const prevIsHuSection = country === 'hu' && /^\d+:\d+\.\s*§/.test(prev);
    const prevIsHeading = prevIsAuSection || prevIsFiSeSection || prevIsLvSection || prevIsHuSection || articleHeadingRe.test(prev) || isSectionHeadingLine(prev);
    const shouldJoin = !isHeading && !prevIsHeading && !/[\.:;]$/.test(prev);

    if (shouldJoin) {
      mergedLines[mergedLines.length - 1] = `${prev} ${line}`;
    } else {
      mergedLines.push(line);
    }
  }

  return mergedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const inferNorma = (fileName: string, text: string): string => {
  const byName = fileName.replace(/\.(pdf|json)$/i, '').trim();
  const line = text
    .split('\n')
    .find((item) => /^ley\s+/i.test(item) || /^real decreto/i.test(item) || /^c[óo]digo/i.test(item));

  return (line || byName).slice(0, 160);
};

const parseLegalStructure = (cleanedText: string, source: string, fileName: string, country = ''): ParsedLegalStructure => {
  const lines = cleanedText.split('\n').map((line) => line.trim()).filter(Boolean);
  const norma = inferNorma(fileName, cleanedText);
  
  // Detectar especialidades base del documento completo
  const baseSpecialties = detectDocumentSpecialties(cleanedText, fileName);

  const articles: StructuredArticle[] = [];
  let currentLibro = '';
  let currentTitulo = '';
  let currentCapitulo = '';
  let currentArticulo = '';
  let currentText: string[] = [];

  const flushArticle = () => {
    if (!currentArticulo || currentText.length === 0) {
      return;
    }

    const text = sanitizeArticleText(currentText.join(' '));
    if (text.length < 50) {
      return;
    }

    // Usar especialidades base + detección específica del artículo
    const specialties = detectArticleSpecialties(text, baseSpecialties);
    const articuloSlug = slugify(currentArticulo);
    articles.push({
      id: `${slugify(source)}-${articuloSlug || `a-${articles.length + 1}`}`,
      norma,
      libro: currentLibro || 'Sin libro',
      titulo: currentTitulo || 'Sin título',
      capitulo: currentCapitulo || 'Sin capítulo',
      articulo: currentArticulo,
      source,
      specialties,
      keywords: extractKeywords(text),
      text
    });
  };

  for (const line of lines) {
    // Multilingual structure headings: ES/PT/IT, FR, DE/NL/SE/NO/DK, EN, HR
    const libroMatch = line.match(/^(?:LIBRO|LIVRE|BUCH|DEEL|DEL|BOK|KIRJA|KNJIGA|BOOK|BOEK)\s+([IVXLCDM\d]+(?:\s*bis|\s*ter)?)\.?\s*(.*)$/i);
    if (libroMatch) {
      const keyword = line.split(/\s+/)[0].toUpperCase();
      currentLibro = `${keyword} ${libroMatch[1]}${libroMatch[2] ? `. ${libroMatch[2]}` : ''}`.trim();
      continue;
    }

    const tituloMatch = line.match(/^(?:T[ÍI]TULO|TITRE|TITEL|TITLE|TITOLO|NASLOV)\s+([IVXLCDM\d]+(?:\s*bis|\s*ter)?)\.?\s*(.*)$/i);
    if (tituloMatch) {
      const keyword = line.split(/\s+/)[0].toUpperCase();
      currentTitulo = `${keyword} ${tituloMatch[1]}${tituloMatch[2] ? `. ${tituloMatch[2]}` : ''}`.trim();
      continue;
    }

    const capituloMatch = line.match(/^(?:CAP[ÍI]TULO|CHAPITRE|KAPITEL|CHAPTER|HOOFDSTUK|CAPITOLO|POGLAVLJE|GLAVA|LUKU|PEATÜKK)\s+([IVXLCDM\d]+(?:\s*bis|\s*ter)?)\.?\s*(.*)$/i);
    if (capituloMatch) {
      const keyword = line.split(/\s+/)[0].toUpperCase();
      currentCapitulo = `${keyword} ${capituloMatch[1]}${capituloMatch[2] ? `. ${capituloMatch[2]}` : ''}`.trim();
      continue;
    }

    // Multilingual article keyword patterns
    const articuloMatch = line.match(
      /^(?:Art[íi]culo|Artigo|Articolo|Article|Artikel|Artikkel|Artykuł|Articolul?|Článek|Článok|Cikk|Pants|Artikolu|Članak|Section)\s+(?:[A-Z]\.?\s*)?([\d]+(?:[a-zA-Z]|[-][\d]+)*(?:\s*(?:bis|ter|quater|quinquies))?)\b\.?/i
    );
    // Luxembourg: Art. L. 010-1. | Art. R. 123-4.
    const luArticleMatch = !articuloMatch && country === 'lu' && line.match(/^Art\.\s+([A-Z]+\.\s+[\d][\w-]*)\./i);
    // Germanic/Nordic/Slavic paragraph sign (§)
    const paragraphMatch = !articuloMatch && !luArticleMatch && line.match(/^§\s*([\d]+(?:[a-zA-Z])?)\b/);
    // FI / SE: "1 §" or "1 a §" (number BEFORE §)
    const fiSeMatch = !articuloMatch && !luArticleMatch && !paragraphMatch &&
      (country === 'fi' || country === 'se') && line.match(/^(\d+[a-z]?)\s+§/);
    // LV: "1.pants." format
    const lvMatch = !articuloMatch && !luArticleMatch && !paragraphMatch && !fiSeMatch &&
      country === 'lv' && line.match(/^(\d+)\.\s*pants\./i);
    // HU: "1:1. § [Title]" format
    const huMatch = !articuloMatch && !luArticleMatch && !paragraphMatch && !fiSeMatch && !lvMatch &&
      country === 'hu' && line.match(/^(\d+:\d+)\.\s*§/);
    // CY: "1. Τίτλος" or "3.-(1) Texto"
    const cyArticleMatch = !articuloMatch && !luArticleMatch && !paragraphMatch && !fiSeMatch && !lvMatch && !huMatch && country === 'cy' &&
      line.match(/^(\d+)\.\s*(?:[-\(]|[^\d\s])/);
    // AU: "3 Object of this Act" (spaces already normalised to 1 by cleanPdfText)
    const auArticleMatch = !articuloMatch && !luArticleMatch && !paragraphMatch && !fiSeMatch && !lvMatch && !huMatch && !cyArticleMatch && country === 'au' &&
      line.match(/^(\d+[A-Za-z]*) [A-Z]/);

    if (articuloMatch) {
      flushArticle();
      const keyword = line.split(/\s+/)[0];
      currentArticulo = `${keyword} ${articuloMatch[1].replace(/\s+/g, ' ').trim()}`;
      currentText = [line];
      continue;
    }

    if (luArticleMatch) {
      flushArticle();
      currentArticulo = `Art. ${luArticleMatch[1].replace(/\s+/g, ' ').trim()}`;
      currentText = [line];
      continue;
    }

    if (paragraphMatch) {
      flushArticle();
      currentArticulo = `§ ${paragraphMatch[1]}`;
      currentText = [line];
      continue;
    }

    if (fiSeMatch) {
      flushArticle();
      currentArticulo = `§ ${fiSeMatch[1]}`;
      currentText = [line];
      continue;
    }

    if (lvMatch) {
      flushArticle();
      currentArticulo = `Pants ${lvMatch[1]}`;
      currentText = [line];
      continue;
    }

    if (huMatch) {
      flushArticle();
      currentArticulo = `§ ${huMatch[1]}`;
      currentText = [line];
      continue;
    }

    if (cyArticleMatch) {
      flushArticle();
      currentArticulo = `Art. ${cyArticleMatch[1]}`;
      currentText = [line];
      continue;
    }

    if (auArticleMatch) {
      flushArticle();
      currentArticulo = `Sec. ${auArticleMatch[1]}`;
      currentText = [line];
      continue;
    }

    if (currentArticulo) {
      currentText.push(line);
    }
  }

  flushArticle();

  return {
    norma,
    baseSpecialties,
    articles
  };
};

const buildChunksFromArticles = (country: string, source: string, articles: StructuredArticle[]): Chunk[] => {
  const sourceSlug = slugify(source);

  return articles.map((article, index) => {
    const hierarchy = [article.libro, article.titulo, article.capitulo].filter(Boolean).join(' · ');
    const title = `${article.articulo} · ${hierarchy}`.slice(0, 180);
    const text = `NORMA: ${article.norma}\n${article.articulo}\n${article.text}`;

    return {
      id: `${country}-${sourceSlug}-art-${index + 1}`,
      title,
      specialties: article.specialties,
      keywords: article.keywords,
      source,
      text
    };
  });
};

const parseArgs = (): { country: string } => {
  const countryArg = process.argv.find((arg) => arg.startsWith('--country='));
  const country = countryArg ? countryArg.split('=')[1] : 'es';

  return {
    country: (country || 'es').toLowerCase()
  };
};

async function run() {
  const { country } = parseArgs();
  const countryDir = path.join(LEYES_DIR, country);

  try {
    await fs.access(countryDir);
  } catch {
    throw new Error(`No existe la carpeta de país: ${countryDir}`);
  }

  const pdfFiles = await getPdfFilesRecursive(countryDir);
  const plaintextFiles = await getPlaintextFilesRecursive(countryDir);
  const totalFiles = pdfFiles.length + plaintextFiles.length;

  if (totalFiles === 0) {
    throw new Error(`No hay archivos legales en ${countryDir}`);
  }

  pdfFiles.sort((a, b) => a.localeCompare(b));
  plaintextFiles.sort((a, b) => a.localeCompare(b));
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const chunks: Chunk[] = [];
  const articles: StructuredArticle[] = [];
  const failedFiles: Array<{ file: string; error: string }> = [];
  const emptyFiles: string[] = [];
  let processedFiles = 0;

  // Procesar PDFs
  for (const pdfPath of pdfFiles) {
    const fileName = path.basename(pdfPath);
    const relSource = path.relative(BACKEND_ROOT, pdfPath).replace(/\\/g, '/');

    try {
      const buffer = await fs.readFile(pdfPath);
      const extractedText = await extractPdfText(buffer);
      const cleanedText = cleanPdfText(extractedText || '', country);

      if (!cleanedText || cleanedText.length < 100) {
        emptyFiles.push(relSource);
        continue;
      }

      const parsed = parseLegalStructure(cleanedText, relSource, fileName, country);
      if (parsed.articles.length === 0) {
        emptyFiles.push(relSource);
        continue;
      }

      articles.push(...parsed.articles);
      chunks.push(...buildChunksFromArticles(country, relSource, parsed.articles));
      processedFiles += 1;
    } catch (error: any) {
      failedFiles.push({
        file: relSource,
        error: error?.message || 'Error desconocido al procesar PDF'
      });
    }
  }

  // Procesar archivos de texto plano (.json)
  for (const txtPath of plaintextFiles) {
    const fileName = path.basename(txtPath);
    const relSource = path.relative(BACKEND_ROOT, txtPath).replace(/\\/g, '/');

    try {
      const extractedText = await extractPlaintextText(txtPath);
      const cleanedText = cleanPlainText(extractedText);

      if (!cleanedText || cleanedText.length < 100) {
        emptyFiles.push(relSource);
        continue;
      }

      const parsed = parseLegalStructure(cleanedText, relSource, fileName, country);
      if (parsed.articles.length === 0) {
        emptyFiles.push(relSource);
        continue;
      }

      articles.push(...parsed.articles);
      chunks.push(...buildChunksFromArticles(country, relSource, parsed.articles));
      processedFiles += 1;
    } catch (error: any) {
      failedFiles.push({
        file: relSource,
        error: error?.message || 'Error desconocido al procesar archivo'
      });
    }
  }

  if (chunks.length === 0 || articles.length === 0) {
    throw new Error('No se pudo extraer estructura legal útil de ningún archivo');
  }

  const output: CountryKnowledge = {
    country: country.toUpperCase(),
    name: COUNTRY_NAMES[country] || country.toUpperCase(),
    updatedAt: new Date().toISOString(),
    version: '2.0',
    chunks,
    articles
  };

  const outputPath = path.join(OUTPUT_DIR, `${country}.json`);
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`✅ Importación completada para ${country.toUpperCase()}`);
  console.log(`   PDFs: ${pdfFiles.length} | Textos: ${plaintextFiles.length} | Total: ${totalFiles}`);
  console.log(`   Archivos procesados correctamente: ${processedFiles}`);
  console.log(`   Archivos sin texto útil: ${emptyFiles.length}`);
  console.log(`   Archivos con error: ${failedFiles.length}`);
  console.log(`   Artículos extraídos: ${articles.length}`);
  console.log(`   Chunks generados: ${chunks.length}`);
  console.log(`   Salida: ${outputPath}`);

  if (emptyFiles.length > 0) {
    console.log('   Archivos sin texto útil:');
    emptyFiles.forEach((file) => console.log(`   - ${file}`));
  }

  if (failedFiles.length > 0) {
    console.log('   Archivos con error:');
    failedFiles.forEach((item) => console.log(`   - ${item.file}: ${item.error}`));
  }
}

run().catch((error) => {
  console.error('❌ Error en importación legal:', error.message);
  process.exit(1);
});
