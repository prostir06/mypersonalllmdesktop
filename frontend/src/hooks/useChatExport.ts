import { useCallback } from 'react';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { conversationAPI } from '../services/api';
import type { Message } from '../types/api';

type UseChatExportArgs = {
  conversationId: string | number | null | undefined;
  messages: Message[];
};

export function downloadTextFile(
  content: string,
  filename: string,
  type: string
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
    throw new Error('Not implemented');
  }, []);

  return { exportMarkdown, exportPdf };
}
