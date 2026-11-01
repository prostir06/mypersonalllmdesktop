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

  try {
    const response = await axios.get<{
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        snippet?: string;
        score?: number;
      }>;
      error?: string;
    }>(searchUrl, {
      timeout: timeoutMs,
      headers: {
        Accept: 'application/json',
      },
    });

    // Якщо SearXNG повернув HTML (наприклад, формат json не увімкнено у settings.yml або сторінка капчі)
    if (typeof response.data === 'string') {
      throw new Error(
        'SearXNG returned non-JSON response. Ensure format=json is enabled in SearXNG settings.'
      );
    }

    if (response.data && typeof response.data.error === 'string') {
      throw new Error(`SearXNG error: ${response.data.error}`);
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
    // Зберігаємо код статусу або мережеву помилку SearXNG
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data as Record<string, unknown> | undefined;
      const detail =
        (data &&
          typeof data === 'object' &&
          (typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
              ? data.message
              : undefined)) ||
        undefined;
      const detailStr = detail ? `: ${detail}` : '';
      throw new Error(
        `SearXNG search failed (${status || err.code || 'network_error'})${detailStr}`,
        { cause: err }
      );
    }
    throw err;
  }
}
