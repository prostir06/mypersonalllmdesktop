import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'react-toastify';
import { chatAPI } from '../services/api';
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
});
