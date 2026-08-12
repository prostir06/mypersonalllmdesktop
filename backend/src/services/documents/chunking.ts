export function chunkText(
  text: string,
  chunkSize = 1500,
  overlap = 300
): string[] {
  if (!text || typeof text !== 'string') return [];

  const cleaned = text.replace(/\r\n/g, '\n').trim();
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
