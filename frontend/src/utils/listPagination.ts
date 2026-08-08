/**
 * Compute next offset for paginated list responses `{ items, total, offset }`.
 * Returns undefined when there is no more data to fetch.
 */
export type ListPageLike = {
  items?: unknown[];
  total?: number;
  offset?: number;
};

export function nextListOffset(
  page: ListPageLike | null | undefined
): number | undefined {
  if (!page || !Array.isArray(page.items)) return undefined;
  const offset = Number(page.offset) || 0;
  const total = Number(page.total) || 0;
  const next = offset + page.items.length;
  if (next >= total) return undefined;
  return next;
}
