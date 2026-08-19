/** First line `## Sheet: Name` from XLSX chunking. */
export function parseSheetName(content: string): string | undefined {
  const first = String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/, 1)[0];
  const match = first.match(/^## Sheet:\s*(.+?)\s*$/);
  const name = match?.[1]?.trim();
  return name || undefined;
}
