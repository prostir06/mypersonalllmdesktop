import axios from 'axios';
import type { WebSearchResultItem } from './types';

export function getDefaultSearxngBaseUrl(): string {
  return process.env.SEARXNG_URL || 'http://searxng:8080';
}

export async function searchSearxng(
  query: string,
  maxResults = 5,
  baseUrl?: string,
  timeoutMs = 10000
): Promise<WebSearchResultItem[]> {
  const cleanQuery = query?.trim();
  if (!cleanQuery) {
    return [];
  }

  const rawBaseUrl = baseUrl || getDefaultSearxngBaseUrl();
  const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, '');
  const searchUrl = `${cleanBaseUrl}/search?q=${encodeURIComponent(cleanQuery)}&format=json`;

  const response = await axios.get<{
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      snippet?: string;
      score?: number;
    }>;
  }>(searchUrl, {
    timeout: timeoutMs,
    headers: {
      Accept: 'application/json',
    },
  });

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
