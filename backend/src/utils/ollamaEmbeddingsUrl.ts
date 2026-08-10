import { assertAllowedHttpUrl } from './urlAllowlist';

/** Derive Ollama /api/embeddings URL from chat completions or base URL. */
export function resolveOllamaEmbeddingsUrl(chatOrBaseUrl: string): string {
  let base = chatOrBaseUrl.trim();
  base = base.replace(/\/v1\/chat\/completions\/?$/i, '');
  base = base.replace(/\/+$/, '');
  const url = `${base}/api/embeddings`;
  return assertAllowedHttpUrl(url).href;
}
