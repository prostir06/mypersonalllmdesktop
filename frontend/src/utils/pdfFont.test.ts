import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUnicodeFont, bytesToBase64, resetPdfFontCache } from './pdfFont';

const jspdfMock = vi.hoisted(() => {
  const addFileToVFS = vi.fn();
  const addFont = vi.fn();
  const setFont = vi.fn();
  return {
    addFileToVFS,
    addFont,
    setFont,
    doc: { addFileToVFS, addFont, setFont },
  };
});

describe('pdfFont', () => {
  it('encodes a buffer larger than one chunk', () => {
    const bytes = new Uint8Array(0x8001);
    bytes[0] = 65;
    bytes[0x8000] = 66;
    const expected = btoa(String.fromCharCode(65) + '\0'.repeat(0x7fff) + String.fromCharCode(66));
    expect(bytesToBase64(bytes)).toBe(expected);
  });

  beforeEach(() => {
    resetPdfFontCache();
    vi.restoreAllMocks();
  });

  it('returns null and logs when font fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down'))
    );

    await expect(applyUnicodeFont(jspdfMock.doc as never)).resolves.toBeUndefined();
    expect(jspdfMock.addFont).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Unicode PDF font load failed:',
      expect.any(Error)
    );

    warn.mockRestore();
  });

  it('skips font registration when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    );

    await expect(applyUnicodeFont(jspdfMock.doc as never)).resolves.toBeUndefined();
    expect(jspdfMock.addFont).not.toHaveBeenCalled();

    await expect(applyUnicodeFont(jspdfMock.doc as never)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('registers Noto font when fetch succeeds', async () => {
    const bytes = new Uint8Array([0x00, 0x41, 0xff]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bytes, { status: 200 })
      )
    );

    await applyUnicodeFont(jspdfMock.doc as never);

    expect(jspdfMock.addFileToVFS).toHaveBeenCalledWith(
      'NotoSans-Regular.ttf',
      expect.any(String)
    );
    expect(jspdfMock.addFont).toHaveBeenCalledWith(
      'NotoSans-Regular.ttf',
      'NotoSans',
      'normal'
    );
    expect(jspdfMock.setFont).toHaveBeenCalledWith('NotoSans');
  });
});
