function chunkPlain(
  cleaned: string,
  chunkSize: number,
  overlap: number
): string[] {
  if (cleaned.length <= chunkSize) return [cleaned];

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = start + chunkSize;

    if (end < cleaned.length) {
      const lastBreak = cleaned.lastIndexOf('\n\n', end);
      if (lastBreak > start + chunkSize / 2) {
        end = lastBreak;
      } else {
        const lastSentence = cleaned.lastIndexOf('. ', end);
        if (lastSentence > start + chunkSize / 2) {
          end = lastSentence + 1;
        }
      }
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end - overlap;
  }

  return chunks;
}

function chunkSheetBlock(
  block: string,
  chunkSize: number,
  overlap: number
): string[] {
  const trimmed = block.trim();
  if (!trimmed) return [];

  const nl = trimmed.indexOf('\n');
  const firstLine = nl === -1 ? trimmed : trimmed.slice(0, nl);
  if (!firstLine.startsWith('## Sheet:')) {
    return chunkPlain(trimmed, chunkSize, overlap);
  }

  const body = nl === -1 ? '' : trimmed.slice(nl + 1);
  if (!body.trim()) return [trimmed];
  if (trimmed.length <= chunkSize) return [trimmed];

  const prefix = `${firstLine}\n`;
  const innerSize = Math.max(1, chunkSize - prefix.length);
  return chunkPlain(body, innerSize, overlap).map((c) =>
    c.startsWith(firstLine) ? c : prefix + c
  );
}

export function chunkText(
  text: string,
  chunkSize = 1500,
  overlap = 300
): string[] {
  if (!text || typeof text !== 'string') return [];

  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  if (/^## Sheet:/m.test(cleaned)) {
    return cleaned
      .split(/(?=^## Sheet: )/m)
      .flatMap((block) => chunkSheetBlock(block, chunkSize, overlap));
  }

  return chunkPlain(cleaned, chunkSize, overlap);
}
