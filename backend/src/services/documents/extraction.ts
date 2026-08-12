const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
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
      await parser.destroy();
    }
  }

  if (kind === 'docx') {
    const docxResult = await mammoth.extractRawText({ buffer });
    return docxResult.value;
  }

  return buffer.toString('utf-8');
}
