const TAVILY_API_URL = 'https://api.tavily.com/search';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

/**
 * Searches the web using Tavily and returns a formatted context string
 * ready to be injected into the AI prompt.
 */
export async function searchWeb(query: string): Promise<string | null> {
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
  if (!TAVILY_API_KEY) {
    console.warn('[Tavily] No API key configured (TAVILY_API_KEY)');
    return null;
  }

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        query,
        search_depth: 'advanced',
        include_answer: true,
        include_raw_content: false,
        max_results: 5,
        include_domains: [],
        exclude_domains: []
      })
    });

    if (!response.ok) {
      console.error(`[Tavily] API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: TavilyResponse = await response.json();

    const parts: string[] = [];

    if (data.answer) {
      parts.push(`Resumen: ${data.answer}`);
    }

    if (data.results && data.results.length > 0) {
      const topResults = data.results
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      const resultTexts = topResults
        .filter(r => r.content && r.content.trim().length > 50)
        .map(r => `[${r.title}]\n${r.content.trim().slice(0, 800)}`)
        .join('\n\n---\n\n');

      if (resultTexts) {
        parts.push(resultTexts);
      }
    }

    if (parts.length === 0) return null;

    return `INFORMACIÓN ACTUALIZADA DE INTERNET (${new Date().toLocaleDateString('es-ES')}):\n\n${parts.join('\n\n')}`;
  } catch (error) {
    console.error('[Tavily] Search failed:', error);
    return null;
  }
}
