/**
 * Detect PDF / Office ZIP (DOCX, XLSX) by magic bytes; validate claimed types.
 */

export type SniffedKind = 'pdf' | 'zip' | 'other';
export type DocumentKind = 'pdf' | 'docx' | 'xlsx' | 'text';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

  // DOCX / XLSX are ZIP containers (local file header)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'zip';
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
    mimetype === DOCX_MIME || originalname.toLowerCase().endsWith('.docx')
  );
}

function claimedXlsx(mimetype: string, originalname: string): boolean {
  return (
    mimetype === XLSX_MIME || originalname.toLowerCase().endsWith('.xlsx')
  );
}

/**
 * Resolve extraction kind. Rejects spoofed PDF/Office claims.
 * Unclaimed ZIP is treated as DOCX (XLSX is handled via mime/extension above).
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

  if (claimedXlsx(mimetype, originalname)) {
    if (sniffed !== 'zip') {
      throw new Error('Файл заявлено як XLSX, але вміст не відповідає формату');
    }
    return 'xlsx';
  }

  if (claimedDocx(mimetype, originalname)) {
    if (sniffed !== 'zip') {
      throw new Error('Файл заявлено як DOCX, але вміст не відповідає формату');
    }
    return 'docx';
  }

  if (sniffed === 'pdf') return 'pdf';
  if (sniffed === 'zip') return 'docx';
  return 'text';
}

export function getMaxUploadBytes(): number {
  const raw = process.env.MAX_FILE_SIZE;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 10 * 1024 * 1024;
}
