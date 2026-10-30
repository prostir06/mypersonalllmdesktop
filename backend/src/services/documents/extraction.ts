const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
import ExcelJS from 'exceljs';
import logger from '../../logger';
import { resolveDocumentKind } from '../../utils/fileMagic';

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
    const docxResult = await mammoth.extractRawText({ buffer });
    return docxResult.value;
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
            .map((v) => {
              if (v === null || v === undefined) return '';
              if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text);
              return String(v);
            });
          rows.push(values.join(','));
        });
        sheetsText.push(`## Sheet: ${worksheet.name}\n${rows.join('\n')}`.trim());
      });
      return sheetsText.join('\n\n');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`XLSX extract failed for ${originalname}: ${message}`);
      throw new Error('Не вдалося прочитати Excel-файл');
    }
  }

  return buffer.toString('utf-8');
}
