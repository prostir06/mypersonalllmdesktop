import { describe, expect, it, vi } from 'vitest';
import { navigateToDeepLink } from './electron';

describe('navigateToDeepLink', () => {
  it('navigates to dashboard conversation query', () => {
    const nav = vi.fn();

    navigateToDeepLink({ type: 'chat', conversationId: '9' }, nav);

    expect(nav).toHaveBeenCalledWith('/dashboard?conversation=9');
  });
});
