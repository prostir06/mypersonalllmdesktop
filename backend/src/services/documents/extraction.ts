const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
import ExcelJS from 'exceljs';
import logger from '../../logger';
import { resolveDocumentKind } from '../../utils/fileMagic';

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
      const pdfData = await parser.getText();
      return pdfData?.text || '';
    } catch (err: unknown) {
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
    try {
      const workbook = new ExcelJS.Workbook();
      // ExcelJS typings use a legacy Buffer declaration incompatible with @types/node v26+ Buffer<ArrayBufferLike>
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      const sheetsText: string[] = [];

      workbook.eachSheet((worksheet) => {
        const rows: string[] = [];
        worksheet.eachRow((row) => {
          const values = (Array.isArray(row.values) ? row.values.slice(1) : [])
            .map((v) => formatCellValue(v));
          rows.push(values.join(','));
        });
        sheetsText.push(`## Sheet: ${worksheet.name}\n${rows.join('\n')}`.trim());
      });
      return sheetsText.join('\n\n');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`XLSX extract failed for ${originalname}: ${message}`);
      throw new Error('Не вдалося прочитати Excel-файл', { cause: err });
    }
  }

  return buffer.toString('utf-8');
}
