const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
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
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      return workbook.SheetNames.map((name: string) => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name] || {});
        return `## Sheet: ${name}\n${csv}`.trim();
      }).join('\n\n');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`XLSX extract failed for ${originalname}: ${message}`);
      throw new Error('Не вдалося прочитати Excel-файл');
    }
  }

  return buffer.toString('utf-8');
}
