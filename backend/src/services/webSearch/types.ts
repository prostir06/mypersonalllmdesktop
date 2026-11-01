import type { RagSource } from '../chat/types';

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export type WebSearchBackendId = 'tavily' | 'searxng' | 'none';

export interface WebSearchOptions {
  maxResults?: number;
  timeoutMs?: number;
  apiKey?: string;
  searxngUrl?: string;
}

export interface WebRagSource extends RagSource {
  type: 'web';
}
