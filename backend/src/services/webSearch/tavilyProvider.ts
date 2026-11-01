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

  const response = await axios.post<{
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      snippet?: string;
      score?: number;
    }>;
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

  const rawResults = response.data?.results;
  if (!Array.isArray(rawResults)) {
    return [];
  }

  return rawResults
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
}
