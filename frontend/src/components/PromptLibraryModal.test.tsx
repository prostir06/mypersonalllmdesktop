import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PromptLibraryModal from './PromptLibraryModal';

const mockGetAll = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../services/api', () => ({
  promptsAPI: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: vi.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: vi.fn(),
  },
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('PromptLibraryModal', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    document.body.removeAttribute('class');
    document.body.removeAttribute('style');
  });

  beforeEach(() => {
    mockGetAll.mockReset();
    mockUpdate.mockReset();
    mockGetAll.mockResolvedValue({
      data: [
        {
          id: 1,
          title: 'Pinned prompt',
          prompt: 'Always be concise',
          is_pinned: false,
        },
      ],
    });
    mockUpdate.mockResolvedValue({ data: {} });
  });

  it('applies a preset prompt when a role card is clicked', async () => {
    const user = userEvent.setup();
    const onSelectPrompt = vi.fn().mockResolvedValue(undefined);
    const onHide = vi.fn();

    render(
      <PromptLibraryModal show onHide={onHide} onSelectPrompt={onSelectPrompt} />
    );

    await user.click(screen.getByText('Senior Python Developer'));

    expect(onSelectPrompt).toHaveBeenCalledWith(
      expect.stringContaining('Senior Python розробник')
    );
    expect(onHide).toHaveBeenCalled();
  });

  it('lists the spreadsheet analyst preset', () => {
    render(
      <PromptLibraryModal show onHide={() => {}} onSelectPrompt={vi.fn()} />
    );
    expect(screen.getByText('Аналітик таблиць')).toBeInTheDocument();
  });

  it('logs when preset apply handler rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const user = userEvent.setup();
    const onSelectPrompt = vi.fn().mockRejectedValue(new Error('settings fail'));

    render(
      <PromptLibraryModal show onHide={() => {}} onSelectPrompt={onSelectPrompt} />
    );

    await user.click(screen.getByText('Senior Python Developer'));

    expect(warn).toHaveBeenCalledWith(
      'Preset prompt apply failed:',
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('toggles pin state for a saved prompt', async () => {
    const user = userEvent.setup();

    render(
      <PromptLibraryModal
        show
        onHide={() => {}}
        onSelectPrompt={vi.fn().mockResolvedValue(undefined)}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Мої промпти' }));
    await waitFor(() => {
      expect(screen.getByText('Pinned prompt')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Закріпити'));

    expect(mockUpdate).toHaveBeenCalledWith(1, { is_pinned: true });
  });
});
