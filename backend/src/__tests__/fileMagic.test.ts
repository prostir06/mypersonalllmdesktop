import {
  sniffFileKind,
  resolveDocumentKind,
  getMaxUploadBytes,
} from '../utils/fileMagic';

describe('fileMagic', () => {
  describe('sniffFileKind', () => {
    it('detects PDF magic', () => {
      expect(sniffFileKind(Buffer.from('%PDF-1.4\n'))).toBe('pdf');
    });

    it('detects DOCX (ZIP) magic', () => {
      expect(sniffFileKind(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe(
        'docx'
      );
    });

    it('returns other for plain text', () => {
      expect(sniffFileKind(Buffer.from('hello'))).toBe('other');
    });
  });

  describe('resolveDocumentKind', () => {
    it('accepts claimed PDF with matching bytes', () => {
      expect(
        resolveDocumentKind(Buffer.from('%PDF'), 'application/pdf', 'a.pdf')
      ).toBe('pdf');
    });

    it('rejects claimed PDF without magic', () => {
      expect(() =>
        resolveDocumentKind(Buffer.from('not pdf'), 'application/pdf', 'a.pdf')
      ).toThrow(/PDF/i);
    });

    it('rejects claimed DOCX without ZIP magic', () => {
      expect(() =>
        resolveDocumentKind(
          Buffer.from('plain'),
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'a.docx'
        )
      ).toThrow(/DOCX/i);
    });

    it('parses sniffed PDF even when mime is text/plain', () => {
      expect(
        resolveDocumentKind(Buffer.from('%PDF-1.7'), 'text/plain', 'notes.txt')
      ).toBe('pdf');
    });
  });

  describe('getMaxUploadBytes', () => {
    const original = process.env.MAX_FILE_SIZE;

    afterEach(() => {
      if (original === undefined) delete process.env.MAX_FILE_SIZE;
      else process.env.MAX_FILE_SIZE = original;
    });

    it('reads MAX_FILE_SIZE from env', () => {
      process.env.MAX_FILE_SIZE = '2048';
      expect(getMaxUploadBytes()).toBe(2048);
    });

    it('defaults to 10MB when unset/invalid', () => {
      delete process.env.MAX_FILE_SIZE;
      expect(getMaxUploadBytes()).toBe(10 * 1024 * 1024);
      process.env.MAX_FILE_SIZE = 'nope';
      expect(getMaxUploadBytes()).toBe(10 * 1024 * 1024);
    });
  });
});
