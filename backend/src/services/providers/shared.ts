import { calculateTokenCost } from '../../utils/tokenCostCalculator';
import type { TokenUsage } from '../chat/types';

export function sumTokenUsage(parts: Array<TokenUsage | undefined>): TokenUsage | undefined {
  const present = parts.filter((part): part is TokenUsage => Boolean(part));
  if (present.length === 0) return undefined;
  const costs = present
    .map((part) => part.estimatedCostUsd)
    .filter((cost): cost is number => typeof cost === 'number');
  return {
    promptTokens: present.reduce((sum, part) => sum + part.promptTokens, 0),
    completionTokens: present.reduce((sum, part) => sum + part.completionTokens, 0),
    totalTokens: present.reduce((sum, part) => sum + part.totalTokens, 0),
    ...(costs.length > 0
      ? { estimatedCostUsd: Math.round(costs.reduce((sum, cost) => sum + cost, 0) * 1_000_000) / 1_000_000 }
      : {}),
  };
}

export function buildTokenUsage(
  promptTokens: number,
  completionTokens: number,
  model: string,
  explicitTotal?: number
): TokenUsage {
  const safePrompt = Math.max(0, Math.trunc(promptTokens || 0));
  const safeCompletion = Math.max(0, Math.trunc(completionTokens || 0));
  const totalTokens =
    typeof explicitTotal === 'number' && explicitTotal >= 0
      ? Math.trunc(explicitTotal)
      : safePrompt + safeCompletion;

  return {
    promptTokens: safePrompt,
    completionTokens: safeCompletion,
    totalTokens,
    estimatedCostUsd: calculateTokenCost(model, safePrompt, safeCompletion),
  };
}

export function isAbortOrCallbackError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  const code = (error as { code?: string }).code;
  return (
    name === 'AbortError' ||
    name === 'StreamCallbackError' ||
    code === 'ABORT_ERR'
  );
}

export function invokeStreamTokenCallback(
  onChunk: ((token: string) => void) | undefined,
  token: string,
  onErrorLog: (message: string) => void
): void {
  if (!onChunk || !token) return;
  try {
    onChunk(token);
  } catch (cbError: unknown) {
    if (isAbortOrCallbackError(cbError)) {
      throw cbError;
    }
    const msg = cbError instanceof Error ? cbError.message : String(cbError);
    onErrorLog(msg);
    const wrapped = cbError instanceof Error ? cbError : new Error(msg);
    wrapped.name = 'StreamCallbackError';
    throw wrapped;
  }
}
