const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
import ExcelJS from 'exceljs';
import logger from '../../logger';
import { resolveDocumentKind } from '../../utils/fileMagic';

export const MAX_PDF_PAGES = 100;
export const MAX_XLSX_ROWS = 5000;
export const MAX_DECOMPRESSED_BYTES = 32 * 1024 * 1024;

export class ExtractionLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionLimitError';
  }
}

/** Uncompressed size from a ZIP central directory, or null when the buffer is not a zip. */
export function zipUncompressedBytes(buf: Buffer): number | null {
  const eocdSig = 0x06054b50;
  const min = Math.max(0, buf.length - 22 - 65535);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === eocdSig) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== 0x02014b50) return null;
    total += buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return total;
}

function assertDecompressed(buffer: Buffer): void {
  const inflated = zipUncompressedBytes(buffer);
  if (inflated != null && inflated > MAX_DECOMPRESSED_BYTES) {
    throw new ExtractionLimitError('Файл розпаковується занадто великим');
  }
}

export function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) {
    return '';
  }

  let raw: string;
  if (v instanceof Date) {
    raw = v.toISOString();
  } else if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if ('text' in obj && obj.text !== undefined) {
      raw = String(obj.text);
    } else if ('result' in obj && obj.result !== undefined && obj.result !== null) {
      raw = obj.result instanceof Date ? obj.result.toISOString() : String(obj.result);
    } else if ('richText' in obj && Array.isArray(obj.richText)) {
      raw = (obj.richText as Array<{ text?: string }>).map((t) => t?.text ?? '').join('');
    } else {
      raw = String(v);
    }
  } else {
    raw = String(v);
  }

  if (raw.includes(',') || raw.includes('"') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export async function extractText(
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<string> {
  const kind = resolveDocumentKind(buffer, mimetype, originalname);

  if (kind === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      if ((info?.total ?? 0) > MAX_PDF_PAGES) {
        throw new ExtractionLimitError(
          `PDF має забагато сторінок (ліміт ${MAX_PDF_PAGES})`
        );
      }
      const pdfData = await parser.getText();
      return pdfData?.text || '';
    } catch (err: unknown) {
      if (err instanceof ExtractionLimitError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`PDF extract failed for ${originalname}: ${message}`);
      throw new Error('Не вдалося прочитати PDF-файл', { cause: err });
    } finally {
      try {
        await parser.destroy();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`PDF parser destroy failed for ${originalname}: ${message}`);
      }
    }
  }

  if (kind === 'docx') {
    assertDecompressed(buffer);
    try {
      const docxResult = await mammoth.extractRawText({ buffer });
      return docxResult.value;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`DOCX extract failed for ${originalname}: ${message}`);
      throw new Error('Не вдалося прочитати DOCX-файл', { cause: err });
    }
  }

  if (kind === 'xlsx') {
    assertDecompressed(buffer);
    try {
      const workbook = new ExcelJS.Workbook();
      // ExcelJS typings use a legacy Buffer declaration incompatible with @types/node v26+ Buffer<ArrayBufferLike>
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      const sheetsText: string[] = [];

      workbook.eachSheet((worksheet) => {
        const rows: string[] = [];
        let rowCount = 0;
        worksheet.eachRow((row) => {
          rowCount += 1;
          if (rowCount > MAX_XLSX_ROWS) {
            throw new ExtractionLimitError(
              `Excel має забагато рядків (ліміт ${MAX_XLSX_ROWS})`
            );
          }
          const values = (Array.isArray(row.values) ? row.values.slice(1) : [])
            .map((v) => formatCellValue(v));
          rows.push(values.join(','));
        });
        sheetsText.push(`## Sheet: ${worksheet.name}\n${rows.join('\n')}`.trim());
      });
      return sheetsText.join('\n\n');
    } catch (err: unknown) {
      if (err instanceof ExtractionLimitError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`XLSX extract failed for ${originalname}: ${message}`);
      throw new Error('Не вдалося прочитати Excel-файл', { cause: err });
    }
  }

  return buffer.toString('utf-8');
}
