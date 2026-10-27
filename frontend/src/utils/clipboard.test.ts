import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyTextWithToast } from './clipboard';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

describe('copyTextWithToast', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('toasts success only after clipboard write resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    copyTextWithToast('hello', 'Скопійовано!');

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('hello');
      expect(toastSuccess).toHaveBeenCalledWith('Скопійовано!', {
        autoClose: 1500,
      });
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('warns and toasts error when clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    copyTextWithToast('hello', 'Скопійовано!');

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Не вдалося скопіювати');
      expect(console.warn).toHaveBeenCalled();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
