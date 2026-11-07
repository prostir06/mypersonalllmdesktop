import { describe, expect, it, vi } from 'vitest';
import { recoverFromPreloadError } from './preloadError';

describe('recoverFromPreloadError', () => {
  it('reloads once and ignores the next failure in the same session', () => {
    const storage = new Map<string, string>();
    const session = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const reload = vi.fn();
    const first = new Event('vite:preloadError');
    const prevent = vi.spyOn(first, 'preventDefault');

    recoverFromPreloadError(first, session, reload);
    recoverFromPreloadError(new Event('vite:preloadError'), session, reload);

    expect(prevent).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });
});
