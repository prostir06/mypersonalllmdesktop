import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'react-toastify';
import { conversationAPI } from '../services/api';
import type { Message } from '../types/api';
import {
  buildPdfFromMessages,
  downloadTextFile,
  useChatExport,
} from './useChatExport';

const jspdfMock = vi.hoisted(() => {
  const splitTextToSize = vi.fn();
  const setFontSize = vi.fn();
  const addPage = vi.fn();
  const text = vi.fn();
  const output = vi.fn();
  const jsPDF = vi.fn(() => ({
    splitTextToSize,
    setFontSize,
    addPage,
    text,
    output,
  }));

  return {
    addPage,
    jsPDF,
    output,
    setFontSize,
    splitTextToSize,
    text,
  };
});

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  conversationAPI: {
    export: vi.fn(),
  },
}));

vi.mock('jspdf', () => ({
  jsPDF: jspdfMock.jsPDF,
}));

vi.mock('../utils/pdfFont', () => ({
  applyUnicodeFont: vi.fn().mockResolvedValue(undefined),
}));
describe('downloadTextFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    jspdfMock.splitTextToSize.mockReset();
    jspdfMock.setFontSize.mockReset();
    jspdfMock.addPage.mockReset();
    jspdfMock.text.mockReset();
    jspdfMock.output.mockReset();
  });

  it('creates blob link and revokes object URL', () => {
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createObjectURL = vi.fn().mockReturnValue('blob:chat-export');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          element.click = click;
        }
        return element;
      });

    downloadTextFile('hello', 'chat.md', 'text/markdown;charset=utf-8');

    expect(createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:chat-export');
  });

  it('warns when there is nothing to export', async () => {
    const { result } = renderHook(() =>
      useChatExport({ conversationId: null, messages: [] })
    );

    await result.current.exportMarkdown();

    expect(toast.warn).toHaveBeenCalledWith('Немає повідомлень для експорту.');
    expect(conversationAPI.export).not.toHaveBeenCalled();
  });

  it('exports markdown from the API for persisted conversations', async () => {
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const download = vi.spyOn(document, 'createElement');
    const createObjectURL = vi.fn().mockReturnValue('blob:persisted-chat');
    const revokeObjectURL = vi.fn();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    download.mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = click;
      }
      return element;
    });

    vi.mocked(conversationAPI.export).mockResolvedValue({
      data: { content: '# Export', filename: 'saved-chat.md' },
    } as Awaited<ReturnType<typeof conversationAPI.export>>);

    const { result } = renderHook(() =>
      useChatExport({
        conversationId: 42,
        messages: [{ role: 'user', content: 'ignored' } as Message],
      })
    );

    await result.current.exportMarkdown();

    expect(conversationAPI.export).toHaveBeenCalledWith(42, 'md');
    expect(click).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Чат експортовано у Markdown! 📄');
  });

  it('builds a local markdown export when the conversation is unsaved', async () => {
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createObjectURL = vi.fn().mockReturnValue('blob:local-chat');
    const revokeObjectURL = vi.fn();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = click;
      }
      return element;
    });

    const { result } = renderHook(() =>
      useChatExport({
        conversationId: null,
        messages: [{ role: 'assistant', content: 'Saved locally' } as Message],
      })
    );

    await result.current.exportMarkdown();

    expect(conversationAPI.export).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Чат експортовано у Markdown! 📄');
  });

  it('shows an error toast when export fails', async () => {
    vi.mocked(conversationAPI.export).mockRejectedValue({
      response: { data: { error: 'Boom' } },
    });

    const { result } = renderHook(() =>
      useChatExport({
        conversationId: 7,
        messages: [{ role: 'user', content: 'hello' } as Message],
      })
    );

    await result.current.exportMarkdown();

    expect(toast.error).toHaveBeenCalledWith('Boom');
  });

  it('builds a PDF blob from chat messages', async () => {
    jspdfMock.splitTextToSize.mockImplementation((value: string) =>
      value.split('\n')
    );
    const pdfBlob = new Blob(['pdf'], { type: 'application/pdf' });
    jspdfMock.output.mockReturnValue(pdfBlob);

    const blob = await buildPdfFromMessages([
      { role: 'user', content: 'Привіт' } as Message,
      { role: 'assistant', content: 'Відповідь' } as Message,
    ]);

    expect(jspdfMock.jsPDF).toHaveBeenCalledWith({ unit: 'pt', format: 'a4' });
    expect(jspdfMock.setFontSize).toHaveBeenCalledWith(12);
    expect(jspdfMock.splitTextToSize).toHaveBeenNthCalledWith(
      1,
      'Ви\nПривіт',
      515
    );
    expect(jspdfMock.splitTextToSize).toHaveBeenNthCalledWith(
      2,
      'Assistant\nВідповідь',
      515
    );
    expect(jspdfMock.text).toHaveBeenCalled();
    expect(jspdfMock.output).toHaveBeenCalledWith('blob');
    expect(blob).toBe(pdfBlob);
  });

  it('exports PDF from persisted conversation via markdown export', async () => {
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createObjectURL = vi.fn().mockReturnValue('blob:chat-pdf');
    const revokeObjectURL = vi.fn();
    jspdfMock.splitTextToSize.mockImplementation((value: string) =>
      value.split('\n')
    );
    jspdfMock.output.mockReturnValue(
      new Blob(['pdf'], { type: 'application/pdf' })
    );

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = click;
      }
      return element;
    });

    vi.mocked(conversationAPI.export).mockResolvedValue({
      data: { content: '# Full export\n\n## Assistant\n\nHi', filename: 'x.md' },
    } as Awaited<ReturnType<typeof conversationAPI.export>>);

    const { result } = renderHook(() =>
      useChatExport({
        conversationId: 42,
        messages: [{ role: 'user', content: 'ignored' } as Message],
      })
    );

    await result.current.exportPdf();

    expect(conversationAPI.export).toHaveBeenCalledWith(42, 'md');
    expect(jspdfMock.splitTextToSize).toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Чат експортовано у PDF! 📕');
  });

  it('exports PDF from local messages', async () => {
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createObjectURL = vi.fn().mockReturnValue('blob:chat-pdf');
    const revokeObjectURL = vi.fn();
    jspdfMock.splitTextToSize.mockImplementation((value: string) =>
      value.split('\n')
    );
    jspdfMock.output.mockReturnValue(
      new Blob(['pdf'], { type: 'application/pdf' })
    );

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = click;
      }
      return element;
    });

    const { result } = renderHook(() =>
      useChatExport({
        conversationId: null,
        messages: [{ role: 'assistant', content: 'Saved locally' } as Message],
      })
    );

    await result.current.exportPdf();

    expect(conversationAPI.export).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Чат експортовано у PDF! 📕');
  });
});
