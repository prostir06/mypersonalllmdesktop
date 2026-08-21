import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const toastWarn = vi.fn();
const setAccessToken = vi.fn();

vi.mock('axios', () => ({
  default: {
    post: (...args: unknown[]) => post(...args),
  },
}));

vi.mock('react-toastify', () => ({
  toast: { warn: (...args: unknown[]) => toastWarn(...args) },
}));

vi.mock('../authToken', () => ({
  setAccessToken: (...args: unknown[]) => setAccessToken(...args),
}));

describe('refreshAccessToken', () => {
  beforeEach(() => {
    post.mockReset();
    toastWarn.mockReset();
    setAccessToken.mockReset();
    vi.resetModules();
    window.history.pushState({}, '', '/dashboard');
  });

  it('dedupes concurrent refresh into one POST', async () => {
    let resolvePost!: (v: unknown) => void;
    post.mockReturnValue(
      new Promise((r) => {
        resolvePost = r;
      })
    );

    const { refreshAccessToken } = await import('./authRefresh');
    const p1 = refreshAccessToken();
    const p2 = refreshAccessToken();
    resolvePost({ data: { token: 't1' } });
    await expect(Promise.all([p1, p2])).resolves.toEqual(['t1', 't1']);
    expect(post).toHaveBeenCalledTimes(1);
    expect(setAccessToken).toHaveBeenCalledWith('t1');
  });

  it('clears token and warns on refresh failure', async () => {
    post.mockRejectedValue(new Error('refresh cookie missing'));
    const { refreshAccessToken } = await import('./authRefresh');
    await expect(refreshAccessToken()).rejects.toThrow('refresh cookie missing');
    expect(setAccessToken).toHaveBeenCalledWith(null);
    expect(toastWarn).toHaveBeenCalled();
  });
});
