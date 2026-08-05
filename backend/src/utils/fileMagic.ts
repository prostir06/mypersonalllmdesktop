/**
 * Detect PDF / DOCX (ZIP) by magic bytes; validate claimed types.
 */

export type SniffedKind = 'pdf' | 'docx' | 'other';
export type DocumentKind = 'pdf' | 'docx' | 'text';

export function sniffFileKind(buffer: Buffer): SniffedKind {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'pdf'; // %PDF
  }

  // DOCX is a ZIP container (local file header)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'docx';
  }

  return 'other';
}

function claimedPdf(mimetype: string, originalname: string): boolean {
  return (
    mimetype === 'application/pdf' ||
    originalname.toLowerCase().endsWith('.pdf')
  );
}

function claimedDocx(mimetype: string, originalname: string): boolean {
  return (
    mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    originalname.toLowerCase().endsWith('.docx')
  );
}

/**
 * Resolve extraction kind. Rejects spoofed PDF/DOCX claims.
 * Unclaimed buffers that sniff as PDF/DOCX are still parsed as such.
 */
export function resolveDocumentKind(
  buffer: Buffer,
  mimetype: string,
  originalname: string
): DocumentKind {
  const sniffed = sniffFileKind(buffer);

  if (claimedPdf(mimetype, originalname)) {
    if (sniffed !== 'pdf') {
      throw new Error('Файл заявлено як PDF, але вміст не відповідає формату');
    }
    return 'pdf';
  }

  if (claimedDocx(mimetype, originalname)) {
    if (sniffed !== 'docx') {
      throw new Error('Файл заявлено як DOCX, але вміст не відповідає формату');
    }
    return 'docx';
  }

  if (sniffed === 'pdf') return 'pdf';
  if (sniffed === 'docx') return 'docx';
  return 'text';
}

export function getMaxUploadBytes(): number {
  const raw = process.env.MAX_FILE_SIZE;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 10 * 1024 * 1024;
}
