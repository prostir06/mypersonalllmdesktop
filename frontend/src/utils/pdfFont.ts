import type { jsPDF } from 'jspdf';

let cachedFontBase64: string | null | undefined;

export function resetPdfFontCache(): void {
  cachedFontBase64 = undefined;
}

async function loadUnicodeFontBase64(): Promise<string | null> {
  if (cachedFontBase64 !== undefined) return cachedFontBase64;
  try {
    const res = await fetch('/fonts/NotoSans-Regular.ttf');
    if (!res.ok) {
      cachedFontBase64 = null;
      return null;
    }
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    cachedFontBase64 = btoa(binary);
    return cachedFontBase64;
  } catch {
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
