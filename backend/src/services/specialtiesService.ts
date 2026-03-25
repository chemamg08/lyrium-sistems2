import OpenAI from 'openai';
import { AI_MODEL } from '../config/aiModel.js';
import { SpecialtiesSettings } from '../models/SpecialtiesSettings.js';

// Tipos de chat disponibles
export type ChatType = 
  | 'lyri'           // Hablar con Lyri (clientes)
  | 'assistant'      // Asistente IA
  | 'defense'        // Preparación Defensa
  | 'contracts'      // Contratos
  | 'summaries'      // Resúmenes de documentos
  | 'fiscal'         // Asesoramiento Fiscal
  | 'writing';       // Redacción

// Todas las especialidades disponibles
export const ALL_SPECIALTIES = [
  'Civil',
  'Penal',
  'Mercantil',
  'Laboral',
  'Fiscal/Tributario',
  'Administrativo',
  'Contencioso-Administrativo',
  'Familia y Sucesiones',
  'Inmobiliario/Arrendamientos',
  'Protección de Datos y Compliance',
  'General'
];

// Especialidades fijas por tipo de chat
export const CHAT_SPECIALTIES: Record<ChatType, string[]> = {
  'lyri': ALL_SPECIALTIES,           // General: todas
  'assistant': ALL_SPECIALTIES,      // General: todas
  'defense': ['Penal', 'Contencioso-Administrativo'],
  'contracts': ['Civil', 'Mercantil', 'Inmobiliario/Arrendamientos'],
  'summaries': ALL_SPECIALTIES,      // General: todas
  'fiscal': ['Fiscal/Tributario'],
  'writing': ALL_SPECIALTIES         // General: todas
};

// Obtener especialidades base de un chat
export function getChatSpecialties(chatType: ChatType): string[] {
  return CHAT_SPECIALTIES[chatType] || ALL_SPECIALTIES;
}

// Verificar si un chat es general (acepta todas las especialidades)
export function isChatGeneral(chatType: ChatType): boolean {
  const specs = CHAT_SPECIALTIES[chatType];
  return specs === ALL_SPECIALTIES || specs.length === ALL_SPECIALTIES.length;
}

const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  'Civil': ['civil', 'obligaciones', 'contrato', 'responsabilidad', 'daños', 'perjuicios', 'arras'],
  'Penal': ['penal', 'delito', 'pena', 'imputado', 'acusación', 'atenuante', 'agravante'],
  'Mercantil': ['mercantil', 'sociedad', 'administrador', 'acciones', 'participaciones', 'empresa'],
  'Laboral': ['laboral', 'trabajador', 'despido', 'salario', 'convenio', 'contrato laboral'],
  'Fiscal/Tributario': ['fiscal', 'tributario', 'impuesto', 'iva', 'irpf', 'declaración', 'aeat'],
  'Administrativo': ['administrativo', 'administración', 'expediente', 'sanción', 'recurso'],
  'Contencioso-Administrativo': ['contencioso', 'administrativo', 'jurisdicción', 'acto administrativo'],
  'Familia y Sucesiones': ['familia', 'divorcio', 'custodia', 'alimentos', 'herencia', 'sucesiones'],
  'Inmobiliario/Arrendamientos': ['inmobiliario', 'arrendamiento', 'alquiler', 'vivienda', 'propiedad', 'hipoteca'],
  'Protección de Datos y Compliance': ['rgpd', 'lopdgdd', 'datos personales', 'compliance', 'cumplimiento', 'delegado']
};

const normalizeText = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

const getQueryTerms = (query: string): string[] => {
  return normalizeText(query)
    .split(/[^a-záéíóúñ0-9]+/i)
    .filter(term => term.length >= 4);
};

const getSpecialtyTerms = (specialties: string[]): string[] => {
  const terms = specialties.flatMap((specialty) => SPECIALTY_KEYWORDS[specialty] || []);
  return Array.from(new Set(terms.map(normalizeText)));
};

export async function getAccountSpecialties(accountId: string): Promise<string[]> {
  try {
    const setting = await SpecialtiesSettings.findById(accountId).lean();
    return Array.isArray(setting?.specialties) ? setting.specialties : [];
  } catch {
    return [];
  }
}

export function buildSpecialtiesSystemPrompt(specialties: string[]): string {
  if (!specialties || specialties.length === 0) {
    return '';
  }

  return `ESPECIALIDADES ACTIVAS PARA ESTA CUENTA: ${specialties.join(', ')}.
Prioriza y enfoca la respuesta en estas áreas. Si la consulta cae fuera de estas especialidades, indícalo y responde de forma limitada.`;
}

export function filterContextBySpecialties(
  rawContext: string,
  specialties: string[],
  userQuery: string,
  maxChars: number = 10000
): string {
  if (!rawContext || !rawContext.trim()) {
    return '';
  }

  if (!specialties || specialties.length === 0) {
    return rawContext.substring(0, maxChars);
  }

  const specialtyTerms = getSpecialtyTerms(specialties);
  const queryTerms = getQueryTerms(userQuery);

  if (specialtyTerms.length === 0 && queryTerms.length === 0) {
    return rawContext.substring(0, maxChars);
  }

  const blocks = rawContext
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const scored = blocks
    .map((block) => {
      const normalizedBlock = normalizeText(block);

      let score = 0;
      for (const term of specialtyTerms) {
        if (normalizedBlock.includes(term)) {
          score += 2;
        }
      }

      for (const term of queryTerms) {
        if (normalizedBlock.includes(term)) {
          score += 1;
        }
      }

      return { block, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return rawContext.substring(0, maxChars);
  }

  const selectedBlocks: string[] = [];
  const selectedSet = new Set<string>();
  let total = 0;

  for (const item of scored) {
    const candidate = item.block;
    const length = candidate.length + 8;

    if (total + length > maxChars) {
      continue;
    }

    selectedBlocks.push(candidate);
    selectedSet.add(candidate);
    total += length;

    if (selectedBlocks.length >= 10) {
      break;
    }
  }

  if (selectedBlocks.length === 0) {
    return rawContext.substring(0, maxChars);
  }

  const minimumContextChars = Math.min(Math.floor(maxChars * 0.35), 3500);

  // Fallback inteligente: si el filtro por especialidad deja muy poco contexto,
  // ampliar con bloques relevantes por consulta para no perder precisión por falta de información.
  if (total < minimumContextChars) {
    const queryScored = blocks
      .map((block) => {
        const normalizedBlock = normalizeText(block);
        let queryScore = 0;

        for (const term of queryTerms) {
          if (normalizedBlock.includes(term)) {
            queryScore += 2;
          }
        }

        return { block, queryScore };
      })
      .filter((item) => item.queryScore > 0)
      .sort((a, b) => b.queryScore - a.queryScore);

    for (const item of queryScored) {
      if (selectedSet.has(item.block)) {
        continue;
      }

      const length = item.block.length + 8;
      if (total + length > maxChars) {
        continue;
      }

      selectedBlocks.push(item.block);
      selectedSet.add(item.block);
      total += length;

      if (total >= minimumContextChars) {
        break;
      }
    }
  }

  // Fallback final: si la consulta no tiene términos útiles,
  // completar con bloques del inicio hasta un mínimo para evitar respuestas pobres.
  if (total < 1200) {
    for (const block of blocks) {
      if (selectedSet.has(block)) {
        continue;
      }

      const length = block.length + 8;
      if (total + length > maxChars) {
        continue;
      }

      selectedBlocks.push(block);
      selectedSet.add(block);
      total += length;

      if (total >= 1200) {
        break;
      }
    }
  }

  return selectedBlocks.join('\n\n---\n\n');
}

// Cliente IA para clasificación de especialidades
let _aiClient: OpenAI | null = null;
function getAiClient(): OpenAI {
  if (!_aiClient) {
    _aiClient = new OpenAI({
      apiKey: process.env.ATLAS_API_KEY,
      baseURL: 'https://api.atlascloud.ai/v1'
    });
  }
  return _aiClient;
}

const CLASSIFY_SYSTEM_PROMPT = `Eres un clasificador de consultas legales. Tu tarea es identificar qué especialidades jurídicas aborda una consulta.

ESPECIALIDADES DISPONIBLES:
- Civil: contratos, obligaciones, responsabilidad, daños, compraventas
- Penal: delitos, penas, procedimiento penal, acusaciones
- Mercantil: sociedades, empresas, comercio, administradores
- Laboral: trabajo, despidos, nóminas, convenios, Seguridad Social
- Fiscal/Tributario: impuestos, IVA, IRPF, Hacienda, declaraciones
- Administrativo: administración pública, expedientes, sanciones
- Contencioso-Administrativo: recursos contra la administración
- Familia y Sucesiones: divorcios, herencias, custodia, pensiones alimenticias
- Inmobiliario/Arrendamientos: alquileres, compraventa de inmuebles, hipotecas
- Protección de Datos y Compliance: RGPD, privacidad, cumplimiento normativo

INSTRUCCIONES:
1. Analiza la consulta del usuario
2. Identifica TODAS las especialidades que podrían ser relevantes
3. Incluye especialidades secundarias si la consulta las toca aunque sea indirectamente
4. Responde SOLO con un JSON array de strings con los nombres exactos de las especialidades

Ejemplo de respuesta: ["Laboral", "Fiscal/Tributario"]

Si la consulta es muy genérica o no toca ninguna especialidad claramente, responde: []`;

/**
 * Clasifica una consulta usando IA para detectar qué especialidades jurídicas aborda.
 * Devuelve un array de especialidades detectadas (puede estar vacío).
 */
export async function classifyQuerySpecialties(query: string): Promise<string[]> {
  if (!query || query.trim().length < 5) {
    return [];
  }

  try {
    const response = await getAiClient().chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
        { role: 'user', content: query.trim() }
      ],
      max_tokens: 150,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Extraer JSON del contenido (puede venir con texto adicional)
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Validar que las especialidades devueltas sean válidas
    const validSpecialties = parsed
      .filter((item): item is string => typeof item === 'string')
      .filter((spec) => ALL_SPECIALTIES.includes(spec) || spec === 'General');

    return validSpecialties;
  } catch (error) {
    console.error('Error clasificando especialidades de consulta:', error);
    return [];
  }
}

/**
 * Obtiene las especialidades efectivas para una consulta en un chat específico.
 * Combina las especialidades base del chat + las detectadas dinámicamente en la consulta.
 */
export async function getEffectiveSpecialties(chatType: ChatType, query: string): Promise<string[]> {
  const baseSpecialties = getChatSpecialties(chatType);
  
  // Si el chat es general, no necesitamos clasificar - ya acepta todo
  if (isChatGeneral(chatType)) {
    return baseSpecialties;
  }

  // Clasificar la consulta para detectar especialidades adicionales
  const detectedSpecialties = await classifyQuerySpecialties(query);
  
  // Unir especialidades base + detectadas (sin duplicados)
  const combined = new Set([...baseSpecialties, ...detectedSpecialties]);
  return Array.from(combined);
}
