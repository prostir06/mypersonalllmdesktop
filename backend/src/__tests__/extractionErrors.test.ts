import { extractText } from '../services/documents/extraction';
import logger from '../logger';

jest.mock('../logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

describe('extraction error handling', () => {
  it('catches and formats errors for corrupt PDF files', async () => {
    // PDF signature %PDF- but followed by broken data
    const brokenPdfBuffer = Buffer.from('%PDF-1.5 broken corrupt content\n%%EOF');

    await expect(
      extractText(brokenPdfBuffer, 'application/pdf', 'corrupt.pdf')
    ).rejects.toThrow('Не вдалося прочитати PDF-файл');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/PDF extract failed for corrupt\.pdf:/)
    );
  });

  it('catches and formats errors for corrupt DOCX files', async () => {
    // Valid ZIP signature PK\x03\x04 but incomplete
    const brokenDocxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

    await expect(
      extractText(
        brokenDocxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'corrupt.docx'
      )
    ).rejects.toThrow('Не вдалося прочитати DOCX-файл');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/DOCX extract failed for corrupt\.docx:/)
    );
  });
});
