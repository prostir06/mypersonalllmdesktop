import { useCallback } from 'react';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import type { jsPDF } from 'jspdf';
import { conversationAPI } from '../services/api';
import type { Message } from '../types/api';
import { applyUnicodeFont } from '../utils/pdfFont';

type UseChatExportArgs = {
  conversationId: string | number | null | undefined;
  messages: Message[];
};

export function downloadBlobFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(
  content: string,
  filename: string,
  type: string
): void {
  downloadBlobFile(new Blob([content], { type }), filename);
}

function buildMarkdownExport(messages: Message[]): string {
  const header = `# Експорт чату — ${new Date().toLocaleDateString('uk-UA')}\n\n`;
  const body = messages
    .map(
      (message) =>
        `## ${message.role === 'user' ? '👤 Ви' : '🤖 Assistant'}\n\n${message.content}`
    )
    .join('\n\n---\n\n');
  return header + body;
}

async function renderPdfLines(doc: jsPDF, text: string): Promise<void> {
  await applyUnicodeFont(doc);
  doc.setFontSize(12);
  let y = 40;
  const lines = doc.splitTextToSize(text, 515);
  for (const line of lines) {
    if (y > 780) {
      doc.addPage();
      y = 40;
    }
    doc.text(line, 40, y);
    y += 14;
  }
}

async function createPdf(): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'pt', format: 'a4' });
}

export async function buildPdfFromMarkdown(markdown: string): Promise<Blob> {
  const doc = await createPdf();
  await renderPdfLines(doc, markdown);
  return doc.output('blob');
}

export async function buildPdfFromMessages(messages: Message[]): Promise<Blob> {
  const doc = await createPdf();
  await applyUnicodeFont(doc);
  doc.setFontSize(12);
  let y = 40;

  for (const message of messages) {
    const header = message.role === 'user' ? 'Ви' : 'Assistant';
    const lines = doc.splitTextToSize(`${header}\n${message.content}`, 515);

    for (const line of lines) {
      if (y > 780) {
        doc.addPage();
        y = 40;
      }

      doc.text(line, 40, y);
      y += 14;
    }

    y += 16;
  }

  return doc.output('blob');
}

export function useChatExport({ conversationId, messages }: UseChatExportArgs) {
  const exportMarkdown = useCallback(async () => {
    if (!conversationId && messages.length === 0) {
      toast.warn('Немає повідомлень для експорту.');
      return;
    }

    try {
      if (conversationId) {
        const res = await conversationAPI.export(conversationId, 'md');
        const { content, filename } = res.data;
        downloadTextFile(
          content,
          filename || `chat-export-${Date.now()}.md`,
          'text/markdown;charset=utf-8'
        );
      } else {
        downloadTextFile(
          buildMarkdownExport(messages),
          `chat-export-${Date.now()}.md`,
          'text/markdown;charset=utf-8'
        );
      }
      toast.success('Чат експортовано у Markdown! 📄');
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка експорту');
    }
  }, [conversationId, messages]);

  const exportPdf = useCallback(async () => {
    if (!conversationId && messages.length === 0) {
      toast.warn('Немає повідомлень для експорту.');
      return;
    }

    try {
      const blob = conversationId
        ? await (async () => {
            const res = await conversationAPI.export(conversationId, 'md');
            return buildPdfFromMarkdown(res.data.content);
          })()
        : await buildPdfFromMessages(messages);
      downloadBlobFile(blob, `chat-export-${Date.now()}.pdf`);
      toast.success('Чат експортовано у PDF! 📕');
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка експорту');
    }
  }, [conversationId, messages]);

  return { exportMarkdown, exportPdf };
}
