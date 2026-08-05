/** Shared limit/offset parsing for list endpoints. */

export function parseListPagination(
  query: { limit?: unknown; offset?: unknown },
  defaults: { limit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
  const defaultLimit = defaults.limit ?? 50;
  const maxLimit = defaults.maxLimit ?? 200;
  const rawLimit = parseInt(String(query.limit ?? ''), 10);
  const rawOffset = parseInt(String(query.offset ?? ''), 10);
  const limit = Math.min(
    Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit,
    maxLimit
  );
  const offset = Math.max(
    Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
    0
  );
  return { limit, offset };
}
