import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  useElectronDeepLinks,
  useElectronUpdateStatus,
} from './useElectronDesktop';

const navigate = vi.fn();
const { toastInfo } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('react-toastify', () => ({
  toast: {
    info: toastInfo,
  },
}));

describe('useElectronDesktop hooks', () => {
  beforeEach(() => {
    navigate.mockReset();
    toastInfo.mockReset();
    delete window.electron;
  });

  it('applies pending deep links and subscribes for future shell events', async () => {
    const unsubscribeDeepLink = vi.fn();
    const unsubscribeNavigate = vi.fn();
    const unsubscribeCheckForUpdates = vi.fn();
    let deepLinkHandler: ((payload: { type: 'chat'; conversationId: string }) => void) | null =
      null;
    let navigateHandler: ((payload: { path: string }) => void) | null = null;
    let checkForUpdatesHandler: (() => void) | null = null;

    window.electron = {
      getBackendUrl: vi.fn(),
      openExternal: vi.fn(),
      isDesktopApp: vi.fn(),
      getPendingDeepLink: vi.fn().mockResolvedValue({ type: 'chat', conversationId: '9' }),
      checkForUpdates: vi.fn(),
      getUpdateStatus: vi.fn(),
      quitAndInstall: vi.fn(),
      onDeepLink: vi.fn((handler) => {
        deepLinkHandler = handler;
        return unsubscribeDeepLink;
      }),
      onNavigate: vi.fn((handler) => {
        navigateHandler = handler;
        return unsubscribeNavigate;
      }),
      onCheckForUpdates: vi.fn((handler) => {
        checkForUpdatesHandler = handler;
        return unsubscribeCheckForUpdates;
      }),
      onUpdateStatus: vi.fn(),
    };

    const { unmount } = renderHook(() => useElectronDeepLinks(true));

    await waitFor(() => {
      expect(window.electron?.getPendingDeepLink).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith('/dashboard?conversation=9');
    });

    deepLinkHandler?.({ type: 'chat', conversationId: '12' });
    expect(navigate).toHaveBeenCalledWith('/dashboard?conversation=12');

    navigateHandler?.({ path: '/settings' });
    expect(navigate).toHaveBeenLastCalledWith('/settings');

    checkForUpdatesHandler?.();
    expect(toastInfo).toHaveBeenCalledWith('Перевіряємо оновлення…');

    unmount();
    expect(unsubscribeDeepLink).toHaveBeenCalledOnce();
    expect(unsubscribeNavigate).toHaveBeenCalledOnce();
    expect(unsubscribeCheckForUpdates).toHaveBeenCalledOnce();
  });

  it('reads initial update status and subscribes to updates', async () => {
    const unsubscribe = vi.fn();
    const onStatus = vi.fn();
    const status = { state: 'available' as const, version: '1.2.3' };

    window.electron = {
      getBackendUrl: vi.fn(),
      openExternal: vi.fn(),
      isDesktopApp: vi.fn(),
      getPendingDeepLink: vi.fn(),
      checkForUpdates: vi.fn(),
      getUpdateStatus: vi.fn().mockResolvedValue(status),
      quitAndInstall: vi.fn(),
      onDeepLink: vi.fn(),
      onNavigate: vi.fn(),
      onCheckForUpdates: vi.fn(),
      onUpdateStatus: vi.fn(() => unsubscribe),
    };

    const { unmount } = renderHook(() => useElectronUpdateStatus(onStatus));

    await waitFor(() => {
      expect(window.electron?.getUpdateStatus).toHaveBeenCalledOnce();
      expect(onStatus).toHaveBeenCalledWith(status);
      expect(window.electron?.onUpdateStatus).toHaveBeenCalledWith(onStatus);
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
