/** Cap a status poll so one request cannot scan an arbitrary id list. */
export const MAX_DOCUMENT_STATUS_IDS = 50;

/**
 * Parse `ids=1,2,3` (or a repeated query array).
 * Empty input is a valid empty poll. Invalid tokens and over-cap lists are rejected.
 */
export function parseDocumentStatusIds(raw: unknown): number[] | null {
  const parts = (
    Array.isArray(raw) ? raw.flatMap((value) => String(value).split(',')) : String(raw ?? '').split(',')
  )
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];
  if (parts.length > MAX_DOCUMENT_STATUS_IDS) return null;

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    if (!/^[1-9]\d*$/.test(part)) return null;
    const id = Number(part);
    if (!Number.isSafeInteger(id)) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
