import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'react-toastify';
import { conversationAPI } from '../services/api';
import type { Message } from '../types/api';
import { downloadTextFile, useChatExport } from './useChatExport';

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

describe('downloadTextFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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

  it('keeps PDF export explicitly unimplemented', async () => {
    const { result } = renderHook(() =>
      useChatExport({
        conversationId: null,
        messages: [],
      })
    );

    await expect(result.current.exportPdf()).rejects.toThrow('Not implemented');
  });
});
