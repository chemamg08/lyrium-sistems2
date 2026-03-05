import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.ATLAS_API_KEY,
      baseURL: 'https://api.atlascloud.ai/v1'
    });
  }
  return _client;
}

/**
 * Analiza imágenes con Qwen3-VL para extraer estructura y contenido
 * @param base64Images Array de imágenes en base64 (data:image/png;base64,...)
 * @param analysisPrompt Instrucciones específicas para el análisis
 * @returns Respuesta de la IA con el análisis
 */
export async function analyzeImagesWithVision(
  base64Images: string[],
  analysisPrompt: string
): Promise<string> {
  try {
    // Construir contenido del mensaje con todas las imágenes
    const content: ChatCompletionContentPart[] = [];

    // Agregar todas las imágenes
    for (const base64Image of base64Images) {
      content.push({
        type: 'image_url',
        image_url: {
          url: base64Image
        }
      });
    }

    // Agregar el prompt de análisis al final
    content.push({
      type: 'text',
      text: analysisPrompt
    });

    const response = await getClient().chat.completions.create({
      model: 'Qwen/Qwen3-VL-235B-A22B-Instruct',
      messages: [
        {
          role: 'user',
          content
        }
      ],
      max_tokens: 4096,
      temperature: 0.1 // Baja temperatura para análisis preciso
    });

    return response.choices[0].message.content || 'No se pudo analizar las imágenes';
  } catch (error: any) {
    console.error('Error al analizar imágenes con Qwen3-VL:', error);
    console.error('Error details:', {
      status: error.status,
      message: error.message,
      error: error.error,
      code: error.code
    });
    throw new Error('Error al comunicarse con el servicio de visión IA');
  }
}

/**
 * Analiza una página específica de un PDF
 * @param base64Image Imagen de la página en base64
 * @param pageNumber Número de página
 * @returns Análisis estructurado de la página
 */
export async function analyzeContractPage(
  base64Image: string,
  pageNumber: number
): Promise<string> {
  const prompt = `Analiza esta página ${pageNumber} de un contrato legal. Extrae:

1. TEXTO: Todo el texto visible, manteniendo formato y jerarquía
2. IMÁGENES: Describe posición y contenido de logos, sellos, firmas
3. ESTRUCTURA: Título, subtítulos, párrafos, listas, tablas
4. CAMPOS VARIABLES: Identifica datos que podrían cambiar (nombres, fechas, cantidades, direcciones)
5. CAMPOS FIJOS: Elementos que NO deben cambiar (logos, formato, cláusulas estándar)

Responde en formato JSON estructurado con estas categorías.`;

  return analyzeImagesWithVision([base64Image], prompt);
}
