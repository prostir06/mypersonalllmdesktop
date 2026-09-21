import type { DocumentRecord } from '../../../types/api';

export function fileKindLabel(doc: DocumentRecord): string | null {
  const name = String(doc.filename || '').toLowerCase();
  const mime = String(doc.file_type || '').toLowerCase();
  if (name.endsWith('.xlsx') || mime.includes('spreadsheet')) return 'XLSX';
  if (name.endsWith('.pdf') || mime.includes('pdf')) return 'PDF';
  if (name.endsWith('.docx') || mime.includes('wordprocessing')) return 'DOCX';
  if (name.endsWith('.md')) return 'MD';
  if (name.endsWith('.txt') || mime.startsWith('text/')) return 'TXT';
  return null;
}
