import axios from 'axios';
import type { WebSearchResultItem } from './types';

const PLACEHOLDER_PATTERNS = [
  'placeholder',
  'tvly-placeholder',
  'your_tavily_key',
  'your_tavily_api_key',
  'dummy',
  'undefined',
  'null',
  'changeme',
];

export function isValidTavilyKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim().toLowerCase();
  if (trimmed.length < 5) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => trimmed.includes(pattern));
}

export async function searchTavily(
  query: string,
  maxResults = 5,
  apiKey?: string,
  timeoutMs = 10000
): Promise<WebSearchResultItem[]> {
  const resolvedKey = apiKey || process.env.TAVILY_API_KEY;
  if (!isValidTavilyKey(resolvedKey)) {
    throw new Error('Tavily API key is missing or invalid');
  }

  const cleanQuery = query?.trim();
  if (!cleanQuery) {
    return [];
  }

  try {
    const response = await axios.post<{
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        snippet?: string;
        score?: number;
      }>;
      error?: string;
    }>(
      'https://api.tavily.com/search',
      {
        api_key: resolvedKey!.trim(),
        query: cleanQuery,
        max_results: maxResults,
        search_depth: 'basic',
      },
      {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data && typeof response.data.error === 'string') {
      throw new Error(`Tavily error: ${response.data.error}`);
    }

    const rawResults = response.data?.results;
    if (!Array.isArray(rawResults)) {
      return [];
    }

    return rawResults
      .filter((raw): raw is NonNullable<typeof raw> => Boolean(raw && typeof raw === 'object'))
      .map((raw) => {
        const title = (raw.title || raw.url || '').trim();
        const url = (raw.url || '').trim();
        const rawSnippet = (raw.content || raw.snippet || '').trim();
        const snippet = rawSnippet.length > 600 ? rawSnippet.slice(0, 600) : rawSnippet;
        const score = typeof raw.score === 'number' ? raw.score : undefined;

        return {
          title,
          url,
          snippet,
          ...(score !== undefined ? { score } : {}),
        };
      })
      .filter((item) => Boolean(item.url))
      .slice(0, maxResults);
  } catch (err: unknown) {
    // Витягуємо точне повідомлення від Tavily API, щоб статус і причина не губилися
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data as Record<string, unknown> | undefined;
      const detail =
        (data &&
          typeof data === 'object' &&
          (typeof data.error === 'string'
            ? data.error
            : typeof (data.detail as any)?.error === 'string'
              ? (data.detail as any).error
              : typeof data.detail === 'string'
                ? data.detail
                : typeof data.message === 'string'
                  ? data.message
                  : undefined)) ||
        undefined;
      const detailStr = detail ? `: ${detail}` : '';
      throw new Error(
        `Tavily search failed (${status || err.code || 'network_error'})${detailStr}`,
        { cause: err }
      );
    }
    throw err;
  }
}
