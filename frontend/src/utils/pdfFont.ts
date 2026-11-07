import type { jsPDF } from 'jspdf';
import fontUrl from '../assets/fonts/NotoSans-Regular.ttf?url';

const BASE64_CHUNK = 0x8000;

let cachedFontBase64: string | null | undefined;

export function resetPdfFontCache(): void {
  cachedFontBase64 = undefined;
}

/** Chunked so a large font never becomes one String.fromCharCode argument list. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    const slice = bytes.subarray(offset, offset + BASE64_CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

async function loadUnicodeFontBase64(): Promise<string | null> {
  if (cachedFontBase64 !== undefined) return cachedFontBase64;
  try {
    const res = await fetch(fontUrl);
    if (!res.ok) {
      cachedFontBase64 = null;
      return null;
    }
    cachedFontBase64 = bytesToBase64(new Uint8Array(await res.arrayBuffer()));
    return cachedFontBase64;
  } catch (err) {
    console.warn('Unicode PDF font load failed:', err);
    cachedFontBase64 = null;
    return null;
  }
}

export async function applyUnicodeFont(doc: jsPDF): Promise<void> {
  const base64 = await loadUnicodeFontBase64();
  if (!base64) return;
  doc.addFileToVFS('NotoSans-Regular.ttf', base64);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.setFont('NotoSans');
}
