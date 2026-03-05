import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { ChatType, getChatSpecialties, isChatGeneral } from './specialtiesService.js';
import { Account } from '../models/Account.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEGAL_KNOWLEDGE_DIR = path.join(__dirname, '../../legal_knowledge');

interface KnowledgeChunk {
  id: string;
  title?: string;
  specialty?: string;          // Retrocompatibilidad
  specialties?: string[];      // Multi-especialidad (nuevo)
  keywords?: string[];
  source?: string;
  text: string;
}

interface KnowledgeArticle {
  id: string;
  norma?: string;
  libro?: string;
  titulo?: string;
  capitulo?: string;
  articulo?: string;
  source?: string;
  specialty?: string;          // Retrocompatibilidad
  specialties?: string[];      // Multi-especialidad (nuevo)
  keywords?: string[];
  text: string;
}

interface CountryKnowledge {
  country: string;
  name?: string;
  updatedAt?: string;
  version?: string;
  chunks?: KnowledgeChunk[];
  articles?: KnowledgeArticle[];
}

interface ScoredChunk {
  chunk: KnowledgeChunk;
  lexicalScore: number;
  semanticScore: number;
  score: number;
}

interface RerankDecision {
  sufficient?: boolean;
  selectedChunkIds?: string[];
  missingTopics?: string[];
}

interface EmbeddingCacheSchema {
  version: string;
  model: string;
  entries: Record<string, number[]>;
}

// =============================================================================
// CACHE EN MEMORIA (carga única al iniciar)
// =============================================================================
interface InMemoryKnowledge {
  chunks: KnowledgeChunk[];
  invertedIndex: Map<string, Set<number>>; // término → índices de chunks
  loadedAt: Date;
}

const knowledgeCache = new Map<string, InMemoryKnowledge>();
const queryResultCache = new Map<string, { result: any; timestamp: number }>();
const QUERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const QUERY_CACHE_MAX_SIZE = 100;

// =============================================================================
// CLASIFICACIÓN DE ESPECIALIDADES POR KEYWORDS (local, sin IA)
// =============================================================================
const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  'Penal': [
    'penal', 'delito', 'delitos', 'pena', 'penas', 'prisión', 'acusado', 'imputado',
    'fiscal', 'ministerio fiscal', 'acusación', 'prescripción del delito',
    'homicidio', 'asesinato', 'lesiones', 'robo', 'hurto', 'estafa',
    'atenuante', 'agravante', 'eximente', 'tentativa', 'blanqueo'
  ],
  'Fiscal/Tributario': [
    'tributario', 'tributaria', 'impuesto', 'impuestos', 'iva', 'irpf',
    'aeat', 'hacienda', 'base imponible', 'hecho imponible', 'cuota tributaria',
    'declaración tributaria', 'autoliquidación', 'sanción tributaria'
  ],
  'Laboral': [
    'laboral', 'trabajador', 'trabajadores', 'despido', 'despido procedente',
    'despido improcedente', 'salario', 'nómina', 'convenio colectivo',
    'contrato de trabajo', 'jornada laboral', 'seguridad social', 'finiquito'
  ],
  'Mercantil': [
    'mercantil', 'sociedad', 'sociedades', 'sociedad limitada', 'sociedad anónima',
    'administrador', 'consejo de administración', 'acciones', 'participaciones',
    'capital social', 'junta general', 'concurso de acreedores'
  ],
  'Civil': [
    'civil', 'obligaciones', 'contrato', 'contratos', 'responsabilidad civil',
    'daños y perjuicios', 'incumplimiento contractual', 'compraventa', 'donación'
  ],
  'Administrativo': [
    'administrativo', 'administración pública', 'procedimiento administrativo',
    'recurso de alzada', 'recurso de reposición', 'silencio administrativo',
    'acto administrativo', 'sanción administrativa'
  ],
  'Contencioso-Administrativo': [
    'contencioso-administrativo', 'contencioso administrativo',
    'jurisdicción contenciosa', 'recurso contencioso'
  ],
  'Familia y Sucesiones': [
    'familia', 'matrimonio', 'divorcio', 'separación', 'custodia',
    'patria potestad', 'pensión de alimentos', 'herencia', 'sucesión', 'testamento'
  ],
  'Inmobiliario/Arrendamientos': [
    'inmobiliario', 'inmueble', 'arrendamiento', 'arrendador', 'arrendatario',
    'alquiler', 'renta', 'desahucio', 'propiedad horizontal', 'hipoteca'
  ],
  'Protección de Datos y Compliance': [
    'rgpd', 'lopdgdd', 'protección de datos', 'datos personales',
    'tratamiento de datos', 'delegado de protección', 'compliance'
  ]
};

/**
 * Clasifica la consulta por especialidades usando keywords locales (sin IA)
 */
function classifyQueryByKeywords(query: string): string[] {
  const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const detectedSpecialties: Array<{ specialty: string; score: number }> = [];

  for (const [specialty, keywords] of Object.entries(SPECIALTY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      if (normalizedQuery.includes(normalizedKeyword)) {
        score += keyword.split(' ').length; // Keywords compuestos valen más
      }
    }
    if (score > 0) {
      detectedSpecialties.push({ specialty, score });
    }
  }

  if (detectedSpecialties.length === 0) {
    return [];
  }

  // Ordenar por score y devolver las top
  detectedSpecialties.sort((a, b) => b.score - a.score);
  const topScore = detectedSpecialties[0].score;
  
  return detectedSpecialties
    .filter(s => s.score >= topScore * 0.5)
    .map(s => s.specialty);
}

/**
 * Obtiene especialidades efectivas: base del chat + detectadas en la consulta
 */
function getEffectiveSpecialtiesLocal(chatType: ChatType | undefined, query: string, accountSpecialties: string[]): string[] {
  // Si no hay chatType, usar especialidades de la cuenta
  if (!chatType) {
    return accountSpecialties;
  }

  // Obtener especialidades base del chat
  const baseSpecialties = getChatSpecialties(chatType);
  
  // Si es un chat general, detectar especialidades de la consulta para priorizar
  if (isChatGeneral(chatType)) {
    const detected = classifyQueryByKeywords(query);
    if (detected.length > 0) {
      return detected;
    }
    return accountSpecialties.length > 0 ? accountSpecialties : [];
  }

  // Para chats específicos, usar sus especialidades + detectar si hay cruce
  const detected = classifyQueryByKeywords(query);
  if (detected.length > 0) {
    // Combinar base + detectadas
    const combined = new Set([...baseSpecialties, ...detected]);
    return Array.from(combined);
  }

  return baseSpecialties;
}

const ATLAS_BASE_URL = 'https://api.atlascloud.ai/v1';
const MISTRAL_RERANK_MODEL = process.env.MISTRAL_RERANK_MODEL || 'Qwen/Qwen3-235B-A22B-Instruct-2507';
const MISTRAL_EMBEDDING_MODEL = process.env.MISTRAL_EMBEDDING_MODEL || 'text-embedding-3-small';

// Rerank desactivado por defecto (lento, poco efectivo)
const MISTRAL_RERANK_ENABLED = (process.env.MISTRAL_RERANK_ENABLED || 'false').toLowerCase() === 'true';
const MISTRAL_EMBEDDINGS_ENABLED = (process.env.MISTRAL_EMBEDDINGS_ENABLED || 'true').toLowerCase() !== 'false';

const LOG_RETRIEVAL = (process.env.LEGAL_RETRIEVAL_LOG || 'true').toLowerCase() !== 'false';
const LEXICAL_WEIGHT = parseFloatOr(process.env.LEGAL_LEXICAL_WEIGHT, 0.50);
const SEMANTIC_WEIGHT = parseFloatOr(process.env.LEGAL_SEMANTIC_WEIGHT, 0.50);

const RERANK_INITIAL_CANDIDATES = parseNumber(process.env.LEGAL_RERANK_INITIAL_CANDIDATES, 42);
const RERANK_EXPANSION_STEP = parseNumber(process.env.LEGAL_RERANK_EXPANSION_STEP, 24);
const RERANK_MAX_CANDIDATES = parseNumber(process.env.LEGAL_RERANK_MAX_CANDIDATES, 160);
const RERANK_MAX_ROUNDS = parseNumber(process.env.LEGAL_RERANK_MAX_ROUNDS, 2);
const MAX_CONTEXT_BLOCKS = parseNumber(process.env.LEGAL_MAX_CONTEXT_BLOCKS, 12);
const LEGAL_SEMANTIC_CANDIDATE_LIMIT = parseNumber(process.env.LEGAL_SEMANTIC_CANDIDATE_LIMIT, 72);
const LEGAL_EMBEDDING_TIMEOUT_MS = parseNumber(process.env.LEGAL_EMBEDDING_TIMEOUT_MS, 5000);
const LEGAL_RERANK_TIMEOUT_MS = parseNumber(process.env.LEGAL_RERANK_TIMEOUT_MS, 7000);

const EMBEDDING_CACHE_VERSION = '1.0';

let _mistralClient: OpenAI | null = null;
function getMistralClient(): OpenAI | null {
  if (!MISTRAL_RERANK_ENABLED && !MISTRAL_EMBEDDINGS_ENABLED) return null;
  if (!_mistralClient) {
    _mistralClient = new OpenAI({
      apiKey: process.env.ATLAS_API_KEY,
      baseURL: ATLAS_BASE_URL
    });
  }
  return _mistralClient;
}

const embeddingCacheMemory = new Map<string, number[]>();
const embeddingCacheLoaded = new Set<string>();

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFloatOr(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

const normalize = (value: string): string => value.toLowerCase().trim();

const tokenize = (value: string): string[] => {
  return normalize(value)
    .split(/[^a-záéíóúñ0-9]+/i)
    .filter((item) => item.length >= 4);
};

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const getCountryFile = (country: string): string => {
  const code = normalize(country || 'es').substring(0, 2) || 'es';
  return path.join(LEGAL_KNOWLEDGE_DIR, `${code}.json`);
};

const getCountryCode = (country: string): string => normalize(country || 'es').substring(0, 2) || 'es';

const getEmbeddingCachePath = (country: string): string => {
  const code = getCountryCode(country);
  return path.join(LEGAL_KNOWLEDGE_DIR, `${code}.embeddings.json`);
};

const hashText = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

// =============================================================================
// INFERENCIA DE ESPECIALIDAD POR FUENTE BOE
// =============================================================================
const BOE_SOURCE_SPECIALTY_MAP: { pattern: string; specialties: string[] }[] = [
  // Derecho Penal
  { pattern: 'BOE-A-1995-25444', specialties: ['Penal'] },           // Código Penal
  { pattern: 'BOE-A-1882-6036',  specialties: ['Penal'] },           // LECrim
  { pattern: 'BOE-A-2000-323',   specialties: ['Penal'] },           // Ley Responsabilidad Penal Menores
  
  // Derecho Civil
  { pattern: 'BOE-A-1889-4763',  specialties: ['Civil'] },           // Código Civil
  { pattern: 'BOE-A-2000-323',   specialties: ['Civil'] },           // LEC 2000
  
  // Derecho Laboral
  { pattern: 'BOE-A-2015-11430', specialties: ['Laboral'] },         // Estatuto Trabajadores
  { pattern: 'BOE-A-2011-15936', specialties: ['Laboral'] },         // Ley Reguladora Jurisdicción Social
  
  // Derecho Tributario
  { pattern: 'BOE-A-2003-23186', specialties: ['Fiscal/Tributario'] }, // Ley General Tributaria
  
  // Derecho Mercantil
  { pattern: 'BOE-A-1885-6627',  specialties: ['Mercantil'] },       // Código de Comercio
  { pattern: 'BOE-A-2003-13813', specialties: ['Mercantil'] },       // Ley Concursal
  
  // Derecho Administrativo
  { pattern: 'BOE-A-2015-10565', specialties: ['Contencioso-Administrativo'] }, // LPACAP
  { pattern: 'BOE-A-2015-10566', specialties: ['Contencioso-Administrativo'] }, // LRJSP
  { pattern: 'BOE-A-1998-16718', specialties: ['Contencioso-Administrativo'] }, // LJCA
  
  // Constitución
  { pattern: 'BOE-A-1978-31229', specialties: ['Constitucional', 'General'] }, // Constitución
];

function inferSpecialtyFromSource(source?: string): string[] | null {
  if (!source) return null;
  const normalizedSource = normalize(source);
  for (const entry of BOE_SOURCE_SPECIALTY_MAP) {
    if (normalizedSource.includes(normalize(entry.pattern))) {
      return entry.specialties;
    }
  }
  return null;
}

/**
 * Obtiene las especialidades de un chunk/article (retrocompatible + inferencia BOE)
 */
function getChunkSpecialties(chunk: KnowledgeChunk | KnowledgeArticle): string[] {
  // 1. Especialidades explícitas
  if (Array.isArray(chunk.specialties) && chunk.specialties.length > 0) {
    return chunk.specialties;
  }
  if (chunk.specialty) {
    return [chunk.specialty];
  }
  
  // 2. Inferir de la fuente BOE
  const inferred = inferSpecialtyFromSource(chunk.source);
  if (inferred) {
    return inferred;
  }
  
  return ['General'];
}

function toChunkFromArticle(article: KnowledgeArticle): KnowledgeChunk {
  const hierarchy = [article.libro, article.titulo, article.capitulo].filter(Boolean).join(' · ');
  const title = article.articulo
    ? `${article.articulo}${hierarchy ? ` · ${hierarchy}` : ''}`
    : hierarchy || article.norma || 'Normativa';

  const text = [
    article.norma ? `NORMA: ${article.norma}` : '',
    article.articulo || '',
    article.text || ''
  ]
    .filter(Boolean)
    .join('\n');

  return {
    id: article.id,
    title,
    specialty: article.specialty,
    specialties: article.specialties || (article.specialty ? [article.specialty] : ['General']),
    keywords: article.keywords || [],
    source: article.source,
    text
  };
}

export async function getAccountCountry(accountId: string): Promise<string> {
  try {
    const account = await Account.findById(accountId);
    return (account?.country || 'ES').toUpperCase();
  } catch {
    return 'ES';
  }
}

async function readCountryKnowledge(country: string): Promise<CountryKnowledge | null> {
  try {
    const filePath = getCountryFile(country);
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data) as CountryKnowledge;

    if (!parsed) {
      return null;
    }

    if (!Array.isArray(parsed.chunks) && !Array.isArray(parsed.articles)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Carga conocimiento legal en memoria con índice invertido (para servidor persistente)
 */
async function loadKnowledgeInMemory(country: string): Promise<InMemoryKnowledge | null> {
  const countryKey = country.toUpperCase();
  
  // Verificar si ya está en cache
  const cached = knowledgeCache.get(countryKey);
  if (cached) {
    return cached;
  }

  // Cargar desde disco
  const knowledge = await readCountryKnowledge(country);
  if (!knowledge) {
    return null;
  }

  const chunks = hydrateChunks(knowledge);
  if (chunks.length === 0) {
    return null;
  }

  // Construir índice invertido para búsqueda lexical rápida
  const invertedIndex = new Map<string, Set<number>>();
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const terms = new Set([
      ...tokenize(chunk.text || ''),
      ...tokenize(chunk.title || ''),
      ...(chunk.keywords || []).flatMap(k => tokenize(k))
    ]);
    
    for (const term of terms) {
      if (!invertedIndex.has(term)) {
        invertedIndex.set(term, new Set());
      }
      invertedIndex.get(term)!.add(i);
    }
  }

  const inMemory: InMemoryKnowledge = {
    chunks,
    invertedIndex,
    loadedAt: new Date()
  };

  knowledgeCache.set(countryKey, inMemory);
  
  // Log siempre visible al cargar conocimiento legal
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`✅ LEGAL KNOWLEDGE LOADED IN MEMORY`);
  console.log(`   País: ${countryKey}`);
  console.log(`   Chunks: ${chunks.length.toLocaleString()}`);
  console.log(`   Términos indexados: ${invertedIndex.size.toLocaleString()}`);
  console.log(`   Timestamp: ${inMemory.loadedAt.toISOString()}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);

  return inMemory;
}

function hydrateChunks(knowledge: CountryKnowledge): KnowledgeChunk[] {
  if (Array.isArray(knowledge.articles) && knowledge.articles.length > 0) {
    return knowledge.articles.map(toChunkFromArticle);
  }

  return Array.isArray(knowledge.chunks) ? knowledge.chunks : [];
}

/**
 * Filtra chunks por especialidades permitidas.
 * Soporta multi-especialidad (specialties array).
 */
function filterChunksBySpecialties(chunks: KnowledgeChunk[], allowedSpecialties: string[]): KnowledgeChunk[] {
  if (!allowedSpecialties || allowedSpecialties.length === 0) {
    return chunks;
  }

  const normalizedAllowed = new Set(allowedSpecialties.map(normalize));
  
  // Si incluye "general", no filtramos - acepta todo
  if (normalizedAllowed.has('general')) {
    return chunks;
  }

  return chunks.filter((chunk) => {
    // Obtener especialidades del chunk (soporta multi-especialidad)
    const chunkSpecialties = getChunkSpecialties(chunk).map(normalize);
    
    // Si el chunk solo tiene "General", lo incluimos solo si hay "General" en las permitidas
    if (chunkSpecialties.length === 1 && chunkSpecialties[0] === 'general') {
      return normalizedAllowed.has('general');
    }

    // Verificar si alguna especialidad del chunk está en las permitidas
    return chunkSpecialties.some(chunkSpec => 
      normalizedAllowed.has(chunkSpec) ||
      Array.from(normalizedAllowed).some(allowed => 
        chunkSpec.includes(allowed) || allowed.includes(chunkSpec)
      )
    );
  });
}

// =============================================================================
// PRIORIZACIÓN DE FUENTES POR KEYWORDS DE CONSULTA
// =============================================================================

// Mapeo de menciones explícitas de normas → patrón BOE para pre-filtrar
const EXPLICIT_SOURCE_MENTIONS: { keywords: string[]; sourcePattern: string; name: string }[] = [
  { keywords: ['código penal', 'codigo penal', 'cp', 'art. 131', 'artículo 131'], sourcePattern: 'BOE-A-1995-25444', name: 'Código Penal' },
  { keywords: ['ley de enjuiciamiento criminal', 'lecrim', 'lecr'], sourcePattern: 'BOE-A-1882-6036', name: 'LECrim' },
  { keywords: ['código civil', 'codigo civil', 'cc'], sourcePattern: 'BOE-A-1889-4763', name: 'Código Civil' },
  { keywords: ['estatuto de los trabajadores', 'estatuto trabajadores', 'et'], sourcePattern: 'BOE-A-2015-11430', name: 'Estatuto Trabajadores' },
  { keywords: ['ley general tributaria', 'lgt'], sourcePattern: 'BOE-A-2003-23186', name: 'LGT' },
  { keywords: ['constitución española', 'constitucion española', 'ce'], sourcePattern: 'BOE-A-1978-31229', name: 'Constitución' },
  { keywords: ['código de comercio', 'codigo de comercio', 'ccom'], sourcePattern: 'BOE-A-1885-6627', name: 'Código de Comercio' },
  { keywords: ['ley concursal', 'lc'], sourcePattern: 'BOE-A-2003-13813', name: 'Ley Concursal' },
];

// Detección implícita: si la consulta menciona DELITOS + términos sustantivos → Código Penal
const DELITOS_KEYWORDS = ['robo', 'hurto', 'homicidio', 'asesinato', 'lesiones', 'estafa', 'apropiación indebida', 
                          'violación', 'agresión sexual', 'blanqueo', 'tráfico de drogas', 'amenazas', 'coacciones',
                          'falsedad documental', 'prevaricación', 'cohecho', 'malversación'];
const SUSTANTIVO_PENAL_KEYWORDS = ['prescripción', 'pena', 'condena', 'años de prisión', 'tipo penal', 'agravante', 'atenuante'];
const PROCESAL_PENAL_KEYWORDS = ['procedimiento', 'instrucción', 'juicio oral', 'recurso de casación', 'prisión provisional', 'fianza'];

// Detecta si el usuario menciona explícitamente una norma y devuelve su patrón BOE
// También detecta implícitamente: delito + prescripción/pena → Código Penal
function detectExplicitSourceMention(query: string): { pattern: string; name: string } | null {
  const normalizedQuery = normalize(query);
  
  // 1. Buscar menciones explícitas de normas
  for (const entry of EXPLICIT_SOURCE_MENTIONS) {
    if (entry.keywords.some(kw => normalizedQuery.includes(normalize(kw)))) {
      console.log(`[SourceDetection] Explícito: "${entry.name}" detectado en query`);
      return { pattern: entry.sourcePattern, name: entry.name };
    }
  }
  
  // 2. Detección implícita: DELITO + término sustantivo penal → Código Penal
  const hasDelito = DELITOS_KEYWORDS.some(d => normalizedQuery.includes(normalize(d)));
  const hasSustantivoPenal = SUSTANTIVO_PENAL_KEYWORDS.some(s => normalizedQuery.includes(normalize(s)));
  const hasProcesalPenal = PROCESAL_PENAL_KEYWORDS.some(p => normalizedQuery.includes(normalize(p)));
  
  console.log(`[SourceDetection] Implícito: hasDelito=${hasDelito}, hasSustantivoPenal=${hasSustantivoPenal}, hasProcesalPenal=${hasProcesalPenal}`);
  
  // Si menciona un delito + prescripción/pena → priorizar Código Penal
  if (hasDelito && hasSustantivoPenal && !hasProcesalPenal) {
    return { pattern: 'BOE-A-1995-25444', name: 'Código Penal (implícito)' };
  }
  
  // Si menciona un delito + procedimiento → priorizar LECrim
  if (hasDelito && hasProcesalPenal && !hasSustantivoPenal) {
    return { pattern: 'BOE-A-1882-6036', name: 'LECrim (implícito)' };
  }
  
  return null;
}

// Pre-filtra chunks por fuente BOE específica
function filterChunksBySource(chunks: KnowledgeChunk[], sourcePattern: string): KnowledgeChunk[] {
  const normalizedPattern = normalize(sourcePattern);
  return chunks.filter(chunk => {
    const source = normalize(chunk.source || '');
    return source.includes(normalizedPattern);
  });
}

const QUERY_SOURCE_PRIORITY: { keywords: string[]; sourcePattern: string; boost: number }[] = [
  // Código Penal - para delitos, penas, prescripción penal
  { 
    keywords: ['código penal', 'delito', 'delitos', 'pena', 'penas', 'prescripción del delito', 
               'prescripción penal', 'robo', 'hurto', 'homicidio', 'asesinato', 'lesiones',
               'estafa', 'atenuante', 'agravante', 'eximente', 'tentativa', 'autor', 'cómplice'],
    sourcePattern: 'BOE-A-1995-25444', 
    boost: 15 
  },
  // Ley de Enjuiciamiento Criminal - para procedimientos penales
  { 
    keywords: ['enjuiciamiento criminal', 'procedimiento penal', 'instrucción', 'juicio oral',
               'recurso de casación', 'habeas corpus', 'prisión provisional', 'fianza'],
    sourcePattern: 'BOE-A-1882-6036', 
    boost: 10 
  },
  // Código Civil - obligaciones, contratos, familia
  { 
    keywords: ['código civil', 'contrato', 'obligación', 'obligaciones', 'herencia', 'testamento',
               'matrimonio', 'divorcio', 'patria potestad', 'usufructo', 'servidumbre', 'hipoteca',
               'prescripción civil', 'prescripción de deuda', 'reclamar deuda'],
    sourcePattern: 'BOE-A-1889-4763', 
    boost: 15 
  },
  // Estatuto de los Trabajadores
  { 
    keywords: ['estatuto trabajadores', 'despido', 'indemnización laboral', 'salario', 'jornada',
               'vacaciones', 'convenio colectivo', 'huelga', 'contrato laboral', 'contrato de trabajo'],
    sourcePattern: 'BOE-A-2015-11430', 
    boost: 15 
  },
  // Ley General Tributaria
  { 
    keywords: ['ley general tributaria', 'tributario', 'hacienda', 'aeat', 'sanción tributaria',
               'inspección tributaria', 'recurso tributario'],
    sourcePattern: 'BOE-A-2003-23186', 
    boost: 15 
  },
  // Constitución Española
  { 
    keywords: ['constitución', 'derechos fundamentales', 'recurso de amparo', 'tribunal constitucional'],
    sourcePattern: 'BOE-A-1978-31229', 
    boost: 15 
  },
];

function getSourceBoost(chunk: KnowledgeChunk, queryNormalized: string): number {
  const source = normalize(chunk.source || '');
  
  for (const rule of QUERY_SOURCE_PRIORITY) {
    // Verificar si la consulta contiene keywords de esta regla
    const hasKeyword = rule.keywords.some(kw => queryNormalized.includes(normalize(kw)));
    if (hasKeyword && source.includes(normalize(rule.sourcePattern))) {
      return rule.boost;
    }
  }
  
  return 0;
}

function scoreChunkLexical(chunk: KnowledgeChunk, queryTerms: string[], specialtiesNormalized: string[], queryNormalized: string): number {
  const text = normalize(chunk.text || '');
  const title = normalize(chunk.title || '');
  const chunkSpecialties = getChunkSpecialties(chunk).map(normalize);
  const keywords = (chunk.keywords || []).map(normalize);

  let score = 0;

  for (const term of queryTerms) {
    if (text.includes(term)) score += 2;
    if (title.includes(term)) score += 2;
    if (keywords.some((item) => item.includes(term))) score += 1;
  }

  if (specialtiesNormalized.length > 0) {
    // Bonus si alguna especialidad del chunk coincide
    const specialtyHit = specialtiesNormalized.some(spec => 
      chunkSpecialties.some(chunkSpec => chunkSpec.includes(spec) || spec.includes(chunkSpec))
    );
    if (specialtyHit) {
      score += 3;
    }
  }

  // Bonus por fuente prioritaria según keywords de la consulta
  score += getSourceBoost(chunk, queryNormalized);

  return score;
}

function buildLexicalRanking(chunks: KnowledgeChunk[], query: string, specialties: string[]): ScoredChunk[] {
  const queryTerms = unique(tokenize(query));
  const specialtiesNormalized = specialties.map(normalize);
  const queryNormalized = normalize(query);

  const scored = chunks.map((chunk) => ({
    chunk,
    lexicalScore: scoreChunkLexical(chunk, queryTerms, specialtiesNormalized, queryNormalized),
    semanticScore: 0,
    score: 0
  }));

  const hasPositive = scored.some((item) => item.lexicalScore > 0);
  return hasPositive ? scored.filter((item) => item.lexicalScore > 0) : scored;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeScores(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return values.map(() => 1);
  return values.map((value) => (value - min) / (max - min));
}

async function ensureEmbeddingCacheLoaded(country: string): Promise<void> {
  const cachePath = getEmbeddingCachePath(country);
  if (embeddingCacheLoaded.has(cachePath)) {
    return;
  }

  try {
    const content = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(content) as EmbeddingCacheSchema;
    if (!parsed || parsed.version !== EMBEDDING_CACHE_VERSION || parsed.model !== MISTRAL_EMBEDDING_MODEL) {
      embeddingCacheLoaded.add(cachePath);
      return;
    }

    for (const [key, value] of Object.entries(parsed.entries || {})) {
      if (Array.isArray(value) && value.length > 0) {
        embeddingCacheMemory.set(key, value);
      }
    }
  } catch {
    // no cache available yet
  }

  embeddingCacheLoaded.add(cachePath);
}

async function persistEmbeddingCache(country: string): Promise<void> {
  const cachePath = getEmbeddingCachePath(country);
  const entries: Record<string, number[]> = {};

  for (const [key, value] of embeddingCacheMemory.entries()) {
    if (key.startsWith(`${getCountryCode(country)}:`)) {
      entries[key] = value;
    }
  }

  const payload: EmbeddingCacheSchema = {
    version: EMBEDDING_CACHE_VERSION,
    model: MISTRAL_EMBEDDING_MODEL,
    entries
  };

  await fs.writeFile(cachePath, JSON.stringify(payload), 'utf-8');
}

async function getEmbedding(text: string, country: string): Promise<number[] | null> {
  if (!getMistralClient() || !MISTRAL_EMBEDDINGS_ENABLED) {
    return null;
  }

  await ensureEmbeddingCacheLoaded(country);

  const key = `${getCountryCode(country)}:${MISTRAL_EMBEDDING_MODEL}:${hashText(text)}`;
  const cached = embeddingCacheMemory.get(key);
  if (cached) {
    return cached;
  }

  try {
    const response = await withTimeout(
      getMistralClient()!.embeddings.create({
        model: MISTRAL_EMBEDDING_MODEL,
        input: text
      }),
      LEGAL_EMBEDDING_TIMEOUT_MS,
      null as any
    );

    if (!response) {
      return null;
    }

    const vector = response.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) {
      return null;
    }

    embeddingCacheMemory.set(key, vector);
    return vector;
  } catch {
    return null;
  }
}

async function applySemanticScores(base: ScoredChunk[], query: string, country: string): Promise<ScoredChunk[]> {
  if (!MISTRAL_EMBEDDINGS_ENABLED || !getMistralClient() || base.length === 0) {
    const lexical = normalizeScores(base.map((item) => item.lexicalScore));
    return base
      .map((item, index) => ({
        ...item,
        score: lexical[index]
      }))
      .sort((a, b) => b.score - a.score);
  }

  const queryEmbedding = await getEmbedding(query, country);
  if (!queryEmbedding) {
    const lexical = normalizeScores(base.map((item) => item.lexicalScore));
    return base
      .map((item, index) => ({
        ...item,
        score: lexical[index]
      }))
      .sort((a, b) => b.score - a.score);
  }

  const semanticRaw: number[] = [];
  for (const item of base) {
    const compactText = `${item.chunk.title || ''}\n${item.chunk.text || ''}`.slice(0, 3200);
    const chunkEmbedding = await getEmbedding(compactText, country);
    semanticRaw.push(chunkEmbedding ? cosineSimilarity(queryEmbedding, chunkEmbedding) : 0);
  }

  const lexicalNorm = normalizeScores(base.map((item) => item.lexicalScore));
  const semanticNorm = normalizeScores(semanticRaw);

  return base
    .map((item, index) => {
      const score = (lexicalNorm[index] * LEXICAL_WEIGHT) + (semanticNorm[index] * SEMANTIC_WEIGHT);
      return {
        ...item,
        semanticScore: semanticNorm[index],
        score
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildContext(chunks: KnowledgeChunk[], maxChars: number): string {
  const selected: string[] = [];
  let total = 0;

  for (const chunk of chunks) {
    const header = `FUENTE: ${chunk.source || 'N/A'} | TÍTULO: ${chunk.title || 'Sin título'} | ESPECIALIDAD: ${chunk.specialty || 'General'}`;
    const block = `${header}\n${chunk.text}`;
    const length = block.length + 8;

    if (total + length > maxChars) {
      continue;
    }

    selected.push(block);
    total += length;

    if (selected.length >= MAX_CONTEXT_BLOCKS) {
      break;
    }
  }

  return selected.join('\n\n---\n\n');
}

function extractCitations(chunks: KnowledgeChunk[]): string[] {
  const cites = chunks.map((chunk) => {
    const source = chunk.source || 'N/A';
    const article = chunk.title?.match(/Art[íi]culo\s+[\d\s\w]+/i)?.[0] || 's/artículo';
    return `${source} :: ${article}`;
  });

  return unique(cites).slice(0, 8);
}

function tryParseRerankDecision(raw: string): RerankDecision | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as RerankDecision;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function rerankWithMistral(
  query: string,
  country: string,
  specialties: string[],
  candidates: KnowledgeChunk[]
): Promise<RerankDecision | null> {
  if (!getMistralClient() || !MISTRAL_RERANK_ENABLED || candidates.length === 0) {
    return null;
  }

  const compactCandidates = candidates.map((item) => ({
    id: item.id,
    source: item.source || '',
    title: item.title || '',
    specialty: item.specialty || '',
    textPreview: (item.text || '').slice(0, 900)
  }));

  const userPrompt = [
    `País jurídico: ${country}`,
    `Especialidades activas: ${specialties.length > 0 ? specialties.join(', ') : 'general'}`,
    `Consulta del usuario: ${query}`,
    '',
    'Candidatos legales (JSON):',
    JSON.stringify(compactCandidates),
    '',
    'Devuelve SOLO JSON válido con formato:',
    '{"sufficient": boolean, "selectedChunkIds": string[], "missingTopics": string[]}',
    '',
    'Reglas:',
    '- sufficient=true solo si se puede responder sin inventar base legal',
    '- selectedChunkIds: ids más relevantes y suficientes',
    '- missingTopics: solo vacía si sufficient=true',
    '- Nunca devuelvas texto fuera del JSON'
  ].join('\n');

  try {
    const response = await withTimeout(
      getMistralClient()!.chat.completions.create({
        model: MISTRAL_RERANK_MODEL,
        temperature: 0,
        max_tokens: 700,
        messages: [
          {
            role: 'system',
            content:
              'Eres un reranker jurídico rápido. Evalúas contexto legal y devuelves únicamente JSON exacto, sin explicaciones.'
          },
          {
            role: 'user',
            content: userPrompt
          }
        ]
      }),
      LEGAL_RERANK_TIMEOUT_MS,
      null as any
    );

    if (!response) {
      return null;
    }

    const content = response.choices[0]?.message?.content || '';
    return tryParseRerankDecision(content);
  } catch {
    return null;
  }
}

export async function getLegalContextForAccount(
  accountId: string,
  query: string,
  specialties: string[] = [],
  maxChars: number = 6000,
  chatType?: ChatType
): Promise<{ country: string; context: string; sufficient: boolean; citations: string[] }> {
  const country = await getAccountCountry(accountId);
  
  // Verificar cache de consultas recientes
  const cacheKey = `${accountId}:${chatType || 'default'}:${hashText(query)}`;
  const cachedResult = queryResultCache.get(cacheKey);
  if (cachedResult && Date.now() - cachedResult.timestamp < QUERY_CACHE_TTL_MS) {
    return cachedResult.result;
  }

  // Usar cache en memoria (servidor persistente)
  const inMemoryKnowledge = await loadKnowledgeInMemory(country);
  
  if (!inMemoryKnowledge || inMemoryKnowledge.chunks.length === 0) {
    return { country, context: '', sufficient: false, citations: [] };
  }

  const allChunks = inMemoryKnowledge.chunks;

  // PASO 1: Detectar si el usuario menciona explícitamente una norma (ej: "Código Penal")
  const explicitSource = detectExplicitSourceMention(query);
  let sourceFilteredChunks: KnowledgeChunk[] | null = null;
  
  if (explicitSource) {
    sourceFilteredChunks = filterChunksBySource(allChunks, explicitSource.pattern);
    if (LOG_RETRIEVAL) {
      console.log(`[LegalRetrieval] Detectado: "${explicitSource.name}" → pre-filtrado a ${sourceFilteredChunks.length} chunks de ${explicitSource.pattern}`);
    }
  }

  // PASO 2: Determinar especialidades efectivas usando keywords locales (sin IA = rápido)
  const effectiveSpecialties = getEffectiveSpecialtiesLocal(chatType, query, specialties);

  // PASO 3: Filtrar chunks por especialidades (solo si no hay pre-filtro por fuente)
  let chunksToSearch: KnowledgeChunk[];
  
  if (sourceFilteredChunks && sourceFilteredChunks.length > 0) {
    // Si el usuario mencionó una norma específica, usar solo esos chunks
    chunksToSearch = sourceFilteredChunks;
  } else {
    // Filtrar por especialidades
    const shouldFilter = chatType && !isChatGeneral(chatType);
    const filteredChunks = shouldFilter
      ? filterChunksBySpecialties(allChunks, effectiveSpecialties)
      : (effectiveSpecialties.length > 0 
          ? filterChunksBySpecialties(allChunks, effectiveSpecialties)
          : allChunks);

    if (filteredChunks.length === 0 && LOG_RETRIEVAL) {
      console.log(`[LegalRetrieval] Filtro de especialidades vacío, usando todos los chunks`);
    }

    chunksToSearch = filteredChunks.length > 0 ? filteredChunks : allChunks;
  }

  let queryForRound = query;
  let bestContext = '';
  let bestCitations: string[] = [];
  let sufficient = false;
  let rerankAttempted = false;
  let rerankSucceeded = false;
  let lastTopSemanticScore = 0;

  for (let round = 0; round <= RERANK_MAX_ROUNDS; round += 1) {
    const lexicalRanked = buildLexicalRanking(chunksToSearch, queryForRound, effectiveSpecialties);
    const semanticInput = lexicalRanked.slice(0, LEGAL_SEMANTIC_CANDIDATE_LIMIT);
    const semanticRanked = await applySemanticScores(semanticInput, queryForRound, country);
    lastTopSemanticScore = semanticRanked[0]?.semanticScore || 0;

    const candidateCount = Math.min(
      RERANK_INITIAL_CANDIDATES + (round * RERANK_EXPANSION_STEP),
      RERANK_MAX_CANDIDATES,
      semanticRanked.length
    );

    const candidates = semanticRanked.slice(0, Math.max(candidateCount, 1)).map((item) => item.chunk);
    if (candidates.length === 0) {
      break;
    }

    if (Boolean(getMistralClient()) && MISTRAL_RERANK_ENABLED && candidates.length > 0) {
      rerankAttempted = true;
    }

    const rerank = await rerankWithMistral(queryForRound, country, specialties, candidates);
    if (rerank) {
      rerankSucceeded = true;
    }
    const byId = new Map(candidates.map((item) => [item.id, item]));
    const rerankedChunks = (rerank?.selectedChunkIds || [])
      .map((id) => byId.get(id))
      .filter((item): item is KnowledgeChunk => Boolean(item));

    const finalChunks = rerankedChunks.length > 0 ? rerankedChunks : candidates;
    const roundContext = buildContext(finalChunks, maxChars);
    const roundCitations = extractCitations(finalChunks);

    if (roundContext && roundContext.length > bestContext.length) {
      bestContext = roundContext;
      bestCitations = roundCitations;
    }

    if (!rerank) {
      sufficient = bestContext.length > 1200;
      break;
    }

    if (rerank.sufficient === true) {
      sufficient = true;
      bestContext = roundContext;
      bestCitations = roundCitations;
      break;
    }

    if (round >= RERANK_MAX_ROUNDS) {
      sufficient = false;
      break;
    }

    const missingTopics = (rerank.missingTopics || []).filter((item) => typeof item === 'string' && item.trim().length > 0);
    if (missingTopics.length > 0) {
      queryForRound = `${query}. Faltantes detectados: ${missingTopics.join(', ')}`;
    }
  }

  if (LOG_RETRIEVAL) {
    const payload = {
      type: 'legal_retrieval',
      accountId,
      country,
      query,
      sufficient,
      contextChars: bestContext.length,
      citations: bestCitations,
      mistralClientConfigured: Boolean(getMistralClient()),
      mistralRerankEnabled: MISTRAL_RERANK_ENABLED,
      mistralEmbeddingsEnabled: MISTRAL_EMBEDDINGS_ENABLED,
      mistralEmbeddingModel: MISTRAL_EMBEDDING_MODEL,
      rerankAttempted,
      rerankSucceeded,
      topSemanticScore: lastTopSemanticScore,
      effectiveSpecialties,
      explicitSourceDetected: explicitSource?.name || null,
      chunksSearched: chunksToSearch.length,
      totalChunks: allChunks.length
    };
    console.log(JSON.stringify(payload));
  }

  await persistEmbeddingCache(country).catch(() => undefined);

  const result = {
    country,
    context: bestContext,
    sufficient,
    citations: bestCitations
  };

  // Guardar en cache de consultas
  if (queryResultCache.size >= QUERY_CACHE_MAX_SIZE) {
    // Eliminar entradas más antiguas
    const oldest = Array.from(queryResultCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, 20);
    for (const [key] of oldest) {
      queryResultCache.delete(key);
    }
  }
  queryResultCache.set(cacheKey, { result, timestamp: Date.now() });

  return result;
}


// Country code -> full country name for jurisdiction prompts
const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Austria', AU: 'Australia', BG: 'Bulgaria', CA: 'Canada',
  CH: 'Switzerland', CY: 'Cyprus', CZ: 'Czech Republic', DE: 'Germany',
  DK: 'Denmark', EE: 'Estonia', ES: 'Spain', FI: 'Finland',
  FR: 'France', GB: 'United Kingdom', GR: 'Greece', HR: 'Croatia',
  HU: 'Hungary', IE: 'Ireland', IT: 'Italy', LT: 'Lithuania',
  LU: 'Luxembourg', LV: 'Latvia', MT: 'Malta', NL: 'Netherlands',
  NO: 'Norway', PL: 'Poland', PT: 'Portugal', RO: 'Romania',
  SE: 'Sweden', SI: 'Slovenia', SK: 'Slovakia', US: 'United States'
};

export function getCountryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase();
}

export function buildCountryLegalSystemPrompt(country: string, legalContext: string): string {
  const countryName = getCountryName(country);

  // When there is NO local legal knowledge JSON for this country
  if (!legalContext) {
    return [
      `JURISDICCIÓN DEL USUARIO: ${countryName} (${country.toUpperCase()})`,
      '',
      `Debes responder aplicando la legislación vigente de ${countryName}.`,
      `Utiliza tu conocimiento del sistema legal de ${countryName} y cualquier información de búsqueda web proporcionada.`,
      'Cita fuentes legales reales (leyes, artículos, estatutos) siempre que sea posible.',
      'Si no estás seguro de un dato normativo concreto, indícalo explícitamente.',
      '',
      'Formato de respuesta:',
      '  1) Conclusión',
      '  2) Fundamento jurídico (con fuentes reales si las conoces)',
      '  3) Límites y supuestos',
    ].join('\n');
  }

  // When there IS local legal knowledge JSON
  return [
    `CONTEXTO LEGAL DEL PAÍS (${countryName} - ${country.toUpperCase()}):`,
    legalContext,
    '',
    'INSTRUCCIONES ESTRICTAS DE RESPUESTA:',
    '- Usa solo este contexto legal. No inventes normas ni artículos.',
    '- Si el contexto no alcanza para una respuesta sólida, responde exactamente: "Información legal insuficiente con la base normativa disponible" y pide qué dato falta.',
    '- Formato obligatorio de salida:',
    '  1) Conclusión',
    '  2) Fundamento jurídico',
    '  3) Artículos/Fuentes citados',
    '  4) Límites y supuestos'
  ].join('\n');
}

// Re-export ChatType for convenience
export type { ChatType } from './specialtiesService.js';
