import OpenAI from 'openai';
import { AI_MODEL } from '../config/aiModel.js';
import { ImproveAIFragment } from '../models/ImproveAIFile.js';
import { Subaccount } from '../models/Subaccount.js';

let _openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openaiClient;
}

let _qwenClient: OpenAI | null = null;
function getQwenClient(): OpenAI {
  if (!_qwenClient) {
    _qwenClient = new OpenAI({
      apiKey: process.env.ATLAS_API_KEY,
      baseURL: 'https://api.atlascloud.ai/v1'
    });
  }
  return _qwenClient;
}

const EMBEDDING_MODEL = 'text-embedding-3-large';
const SIMILARITY_THRESHOLD = 0.70;
const MAX_FRAGMENTS = 20;
const CHUNK_SIZE = 500; // tokens approx (using words as proxy)
const CHUNK_OVERLAP = 50;

/**
 * Generate embedding for a given text using OpenAI text-embedding-3-large
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // limit to ~8k chars to stay within token limits
  });
  return response.data[0].embedding;
}

/**
 * Split text into overlapping chunks of approximately CHUNK_SIZE words
 */
export function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length <= CHUNK_SIZE) return [text.trim()];

  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(' ');
    chunks.push(chunk);
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Resolve the root accountId for an account (handles subaccounts)
 */
export async function resolveAccountId(accountId: string): Promise<string> {
  const sub = await Subaccount.findById(accountId);
  if (sub && sub.parentAccountId) return sub.parentAccountId;
  return accountId;
}

/**
 * Generate a detailed summary of a conversation using Qwen
 */
async function summarizeConversation(messages: { role: string; content: string }[]): Promise<string> {
  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
    .join('\n\n');

  // Limit to last ~6000 words to avoid token limits
  const words = conversationText.split(/\s+/);
  const trimmed = words.length > 6000 ? words.slice(-6000).join(' ') : conversationText;

  const response = await getQwenClient().chat.completions.create({
    model: AI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Eres un asistente que genera resúmenes concisos. Resume la siguiente conversación legal identificando: temas principales, área legal específica, conceptos clave, leyes o artículos mencionados, estrategias discutidas, y contexto del caso (partes, hechos, pretensiones). Responde en español con un resumen detallado de 200-400 palabras.',
      },
      { role: 'user', content: trimmed },
    ],
    max_tokens: 600,
    temperature: 0.1,
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * Search for relevant fragments based on conversation context.
 * This is the main RAG search function called from chat controllers.
 */
export async function searchImproveAIContext(
  accountId: string,
  messages: { role: string; content: string }[]
): Promise<{ context: string; found: boolean }> {
  try {
    const rootAccountId = await resolveAccountId(accountId);

    // Check if there are any fragments for this account
    const fragmentCount = await ImproveAIFragment.countDocuments({ accountId: rootAccountId });
    if (fragmentCount === 0) return { context: '', found: false };

    // Generate conversation summary with Qwen
    const summary = await summarizeConversation(messages);
    if (!summary.trim()) return { context: '', found: false };

    // Generate embedding for the summary
    const queryEmbedding = await generateEmbedding(summary);

    // Fetch all fragments for this account
    const fragments = await ImproveAIFragment.find({ accountId: rootAccountId }).lean();

    // Calculate similarity for each fragment
    const scored = fragments
      .map(f => ({
        text: f.text,
        fileName: f.fileName,
        similarity: cosineSimilarity(queryEmbedding, f.embedding),
      }))
      .filter(f => f.similarity >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_FRAGMENTS);

    if (scored.length === 0) return { context: '', found: false };

    // Build context string
    const contextParts = scored.map((f, i) =>
      `[Fragmento ${i + 1} - ${f.fileName} (relevancia: ${(f.similarity * 100).toFixed(0)}%)]:\n${f.text}`
    );

    const context = `CONTEXTO DE ARCHIVOS DE MEJORA DEL USUARIO (información de casos y documentos previos del despacho - usa esta información para enriquecer tu respuesta cuando sea relevante, intégrala de forma natural sin listar los fragmentos):\n\n${contextParts.join('\n\n')}`;

    return { context, found: true };
  } catch (error) {
    console.error('Error in RAG search:', error);
    return { context: '', found: false };
  }
}

/**
 * Process a PDF file: extract text, chunk, generate embeddings, store fragments
 */
export async function processImproveAIFile(
  fileId: string,
  filePath: string,
  fileName: string,
  accountId: string,
  folderId: string | null
): Promise<number> {
  const pdfParseModule: any = await import('pdf-parse');
  const PDFParse = pdfParseModule.PDFParse;
  const fs = await import('fs');

  const buffer = fs.readFileSync(filePath);

  let text = '';
  if (PDFParse) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    text = result?.text || '';
  } else {
    // Fallback: try default export
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const pdfData = await pdfParse(buffer);
    text = pdfData.text || '';
  }

  if (!text || text.trim().length < 10) {
    throw new Error('No se pudo extraer texto del PDF');
  }

  const chunks = chunkText(text);

  // Generate embeddings for all chunks
  const fragments = [];
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i]);
    fragments.push({
      _id: `${fileId}_frag_${i}`,
      accountId,
      fileId,
      fileName,
      folderId,
      text: chunks[i],
      embedding,
      index: i,
    });
  }

  // Bulk insert fragments
  if (fragments.length > 0) {
    await ImproveAIFragment.insertMany(fragments);
  }

  return fragments.length;
}
