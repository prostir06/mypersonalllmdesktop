import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'react-toastify';
import type { AxiosResponse } from 'axios';
import { chatAPI } from '../services/api';
import type { ChatAttachmentUploadResponse } from '../types/api';
import { useChatAttachments } from './useChatAttachments';

vi.mock('react-toastify', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../services/api', () => ({
  chatAPI: { uploadAttachment: vi.fn() },
}));

describe('useChatAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs and toasts when attachment upload fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(chatAPI.uploadAttachment).mockRejectedValue(new Error('upload down'));

    const { result } = renderHook(() => useChatAttachments());
    const file = new File(['a,b\n1,2'], 'data.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await act(async () => {
      await result.current.handleFileAttach({
        target: { files: [file], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(warn).toHaveBeenCalledWith(
      'Chat attachment upload failed:',
      expect.any(Error)
    );
    expect(toast.error).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('attaches file and preserves Ukrainian filename in chat attachments', async () => {
    const mockResponse: AxiosResponse<ChatAttachmentUploadResponse> = {
      data: {
        filename: 'Контекст.txt',
        content: 'вміст файлу',
        chars: 11,
        truncated: false,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as AxiosResponse['config'],
    };
    vi.mocked(chatAPI.uploadAttachment).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useChatAttachments());
    const file = new File(['вміст файлу'], 'Контекст.txt', {
      type: 'text/plain',
    });

    await act(async () => {
      await result.current.handleFileAttach({
        target: { files: [file], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.chatAttachments).toEqual([
      { filename: 'Контекст.txt', content: 'вміст файлу' },
    ]);
    expect(toast.success).toHaveBeenCalledWith('Файл додано до повідомлення');
  });
});
