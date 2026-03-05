import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLegalContextForAccount } from '../services/legalKnowledgeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.join(__dirname, '../..');
const ACCOUNTS_PATH = path.join(BACKEND_ROOT, 'accounts.json');

type EvalCase = {
  question: string;
  expectedTerms: string[];
  expectedArticles: string[];
};

const EVAL_SET_ES: EvalCase[] = [
  {
    question: '¿Qué regula el artículo 118 sobre el derecho de defensa?',
    expectedTerms: ['derecho de defensa', 'abogado', 'declaración'],
    expectedArticles: ['Artículo 118']
  },
  {
    question: '¿Cuál es la regla general de competencia penal del artículo 8?',
    expectedTerms: ['jurisdicción criminal', 'improrrogable'],
    expectedArticles: ['Artículo 8']
  },
  {
    question: '¿Qué dice la ley sobre el recurso de apelación y su plazo?',
    expectedTerms: ['recurso de apelación', 'cinco días'],
    expectedArticles: ['Artículo 212']
  },
  {
    question: '¿Qué obligaciones hay sobre denuncia de delito público?',
    expectedTerms: ['denuncia', 'delito público', 'obligados'],
    expectedArticles: ['Artículo 259', 'Artículo 262']
  }
];

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

async function resolveAccountId(): Promise<string> {
  const arg = process.argv.find((item) => item.startsWith('--accountId='));
  if (arg) {
    return arg.split('=')[1];
  }

  try {
    const raw = await fs.readFile(ACCOUNTS_PATH, 'utf-8');
    const accounts = JSON.parse(raw) as Array<{ id?: string }>;
    const first = accounts.find((a) => typeof a.id === 'string' && a.id.length > 0);
    if (first?.id) {
      return first.id;
    }
  } catch {
    // ignored
  }

  throw new Error('No se pudo resolver accountId. Usa --accountId=<id>.');
}

function metricFromCase(
  context: string,
  citations: string[],
  sufficient: boolean,
  testCase: EvalCase
): { precisionAtK: number; recall: number; hallucinationRisk: number } {
  const normalizedContext = normalize(context);
  const expectedTerms = testCase.expectedTerms.map(normalize);

  const termHits = expectedTerms.filter((term) => normalizedContext.includes(term)).length;
  const recall = expectedTerms.length > 0 ? termHits / expectedTerms.length : 1;

  const k = Math.max(citations.length, 1);
  const expectedArticles = testCase.expectedArticles.map(normalize);
  const relevantCitations = citations.filter((citation) => {
    const c = normalize(citation);
    return expectedArticles.some((article) => c.includes(normalize(article)));
  }).length;
  const precisionAtK = relevantCitations / k;

  const hallucinationRisk = sufficient && (relevantCitations === 0 || recall < 0.4) ? 1 : 0;

  return {
    precisionAtK,
    recall,
    hallucinationRisk
  };
}

async function run() {
  const accountId = await resolveAccountId();

  let precisionTotal = 0;
  let recallTotal = 0;
  let hallucinationRiskCount = 0;

  console.log(`🔍 Ejecutando evaluación legal con accountId=${accountId}`);

  for (const testCase of EVAL_SET_ES) {
    const result = await getLegalContextForAccount(accountId, testCase.question, [], 5000);
    const metrics = metricFromCase(result.context, result.citations, result.sufficient, testCase);

    precisionTotal += metrics.precisionAtK;
    recallTotal += metrics.recall;
    hallucinationRiskCount += metrics.hallucinationRisk;

    console.log(`\nPregunta: ${testCase.question}`);
    console.log(`- sufficient: ${result.sufficient}`);
    console.log(`- citations: ${result.citations.length}`);
    console.log(`- precision@k: ${metrics.precisionAtK.toFixed(3)}`);
    console.log(`- recall: ${metrics.recall.toFixed(3)}`);
    console.log(`- hallucinationRisk: ${metrics.hallucinationRisk}`);
  }

  const n = EVAL_SET_ES.length;
  const report = {
    totalCases: n,
    avgPrecisionAtK: precisionTotal / n,
    avgRecall: recallTotal / n,
    hallucinationRiskRate: hallucinationRiskCount / n
  };

  console.log('\n📊 Resumen evaluación:');
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error('❌ Error en evaluación legal:', error.message);
  process.exit(1);
});
