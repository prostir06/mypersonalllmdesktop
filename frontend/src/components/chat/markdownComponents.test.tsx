import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { markdownComponents } from './markdownComponents';

describe('markdownComponents.a', () => {
  const originalElectron = (window as unknown as { electron?: unknown }).electron;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (window as unknown as { electron?: unknown }).electron = originalElectron;
  });

  it('opens https links in a new tab with noopener', () => {
    const A = markdownComponents.a!;
    render(<A href="https://example.com">docs</A>);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not link javascript urls', () => {
    const A = markdownComponents.a!;
    render(<A href="javascript:alert(1)">x</A>);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('delegates to window.electron.openExternal and logs warning on rejection without unhandled rejection', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const openExternal = vi.fn().mockRejectedValue(new Error('Shell handler not found'));
    (window as unknown as { electron?: { openExternal: typeof openExternal } }).electron = {
      openExternal,
    };

    const A = markdownComponents.a!;
    render(<A href="https://desktop.local/guide">Guide</A>);
    const link = screen.getByRole('link', { name: 'Guide' });
    fireEvent.click(link);

    expect(openExternal).toHaveBeenCalledWith('https://desktop.local/guide');
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to open external link in desktop app:',
        expect.any(Error)
      );
    });
  });
});
