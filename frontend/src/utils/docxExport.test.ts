import { describe, expect, it, vi } from 'vitest';
import {
  buildDocxBuffer,
  downloadArtifactAsDocx,
  sanitizeDocxFilename,
} from './docxExport';

describe('docxExport', () => {
  it('sanitizes Ukrainian and Latin titles into safe .docx filenames', () => {
    expect(sanitizeDocxFilename('Договір №12/2026: Надання послуг')).toBe(
      'Договір_12_2026_Надання_послуг.docx'
    );
    expect(sanitizeDocxFilename('')).toBe('document.docx');
    expect(sanitizeDocxFilename('   ')).toBe('document.docx');
    expect(sanitizeDocxFilename(undefined)).toBe('document.docx');
    expect(sanitizeDocxFilename('Document.docx')).toBe('Document.docx');
  });

  it('builds a valid OOXML ZIP buffer (PK magic bytes) from Markdown with headings, bold text, lists, and tables', async () => {
    const markdown = [
      '# Договір про співпрацю',
      '## 1. Предмет договору',
      'Сторони домовились про **надання консультаційних послуг** та *технічної підтримки* з кодом `SLA-99`.',
      '- Перший етап аналізу',
      '- Другий етап впровадження',
      '1. Підписання акту',
      '2. Оплата рахунку',
      '',
      '| Етап | Термін | Вартість |',
      '| --- | --- | --- |',
      '| Аудит | 5 днів | 15 000 грн |',
      '| Розробка | 10 днів | 45 000 грн |',
    ].join('\n');

    const bytes = await buildDocxBuffer(markdown, 'Договір про співпрацю');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // ZIP magic bytes: 'P' (0x50), 'K' (0x4b), 0x03, 0x04
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  it('converts basic HTML markup into a valid .docx buffer when exporting HTML artifacts', async () => {
    const html =
      '<h1>Звіт за квартал</h1><p>Основні <strong>показники</strong> виконання.</p><ul><li>Пункт А</li></ul>';
    const bytes = await buildDocxBuffer(html, 'Звіт');
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('downloads artifact as docx file with expected MIME and filename', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-docx-url');
    const revokeObjectURLMock = vi.fn();
    const clickMock = vi.fn();

    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        el.click = clickMock;
      }
      return el;
    });

    await downloadArtifactAsDocx('# Test Document', 'Test Report');

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    const createdBlob = createObjectURLMock.mock.calls[0][0] as Blob;
    expect(createdBlob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-docx-url');

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('revokes blob url even if DOM click throws an error', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-error-url');
    const revokeObjectURLMock = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        el.click = () => {
          throw new Error('Download blocked by security policy');
        };
      }
      return el;
    });

    await expect(downloadArtifactAsDocx('# Crash doc', 'Report')).rejects.toThrow(
      'Download blocked by security policy'
    );

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-error-url');

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
