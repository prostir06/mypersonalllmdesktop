import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  useElectronDeepLinks,
  useElectronShellListeners,
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

  it('applies pending deep links only when enabled', async () => {
    const unsubscribeDeepLink = vi.fn();

    window.electron = {
      getBackendUrl: vi.fn(),
      openExternal: vi.fn(),
      isDesktopApp: vi.fn(),
      getPendingDeepLink: vi.fn().mockResolvedValue({ type: 'chat', conversationId: '9' }),
      checkForUpdates: vi.fn(),
      getUpdateStatus: vi.fn(),
      quitAndInstall: vi.fn(),
      onDeepLink: vi.fn(() => unsubscribeDeepLink),
      onNavigate: vi.fn(),
      onCheckForUpdates: vi.fn(),
      onUpdateStatus: vi.fn(),
    };

    const { unmount } = renderHook(() => useElectronDeepLinks(true));

    await waitFor(() => {
      expect(window.electron?.getPendingDeepLink).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith('/dashboard?conversation=9');
    });

    const deepLinkHandler = vi.mocked(window.electron.onDeepLink).mock.calls[0]?.[0];
    deepLinkHandler?.({ type: 'chat', conversationId: '12' });
    expect(navigate).toHaveBeenCalledWith('/dashboard?conversation=12');

    unmount();
    expect(unsubscribeDeepLink).toHaveBeenCalledOnce();
  });

  it('logs when pending deep link IPC rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    window.electron = {
      getBackendUrl: vi.fn(),
      openExternal: vi.fn(),
      isDesktopApp: vi.fn(),
      getPendingDeepLink: vi.fn().mockRejectedValue(new Error('ipc down')),
      checkForUpdates: vi.fn(),
      getUpdateStatus: vi.fn(),
      quitAndInstall: vi.fn(),
      onDeepLink: vi.fn(() => vi.fn()),
      onNavigate: vi.fn(),
      onCheckForUpdates: vi.fn(),
      onUpdateStatus: vi.fn(),
    };

    renderHook(() => useElectronDeepLinks(true));

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'Pending deep link read failed:',
        expect.any(Error)
      );
    });
    expect(navigate).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('subscribes to tray shell events independently of auth', () => {
    const unsubscribeNavigate = vi.fn();
    const unsubscribeCheckForUpdates = vi.fn();

    window.electron = {
      getBackendUrl: vi.fn(),
      openExternal: vi.fn(),
      isDesktopApp: vi.fn(),
      getPendingDeepLink: vi.fn(),
      checkForUpdates: vi.fn(),
      getUpdateStatus: vi.fn(),
      quitAndInstall: vi.fn(),
      onDeepLink: vi.fn(),
      onNavigate: vi.fn(() => unsubscribeNavigate),
      onCheckForUpdates: vi.fn(() => unsubscribeCheckForUpdates),
      onUpdateStatus: vi.fn(),
    };

    const { unmount } = renderHook(() => useElectronShellListeners());

    const navigateHandler = vi.mocked(window.electron.onNavigate).mock.calls[0]?.[0];
    navigateHandler?.({ path: '/settings' });
    expect(navigate).toHaveBeenLastCalledWith('/settings');

    const checkForUpdatesHandler =
      vi.mocked(window.electron.onCheckForUpdates).mock.calls[0]?.[0];
    checkForUpdatesHandler?.();
    expect(toastInfo).toHaveBeenCalledWith('Перевіряємо оновлення…');

    unmount();
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

  it('logs when initial update status IPC rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onStatus = vi.fn();

    window.electron = {
      getBackendUrl: vi.fn(),
      openExternal: vi.fn(),
      isDesktopApp: vi.fn(),
      getPendingDeepLink: vi.fn(),
      checkForUpdates: vi.fn(),
      getUpdateStatus: vi.fn().mockRejectedValue(new Error('ipc down')),
      quitAndInstall: vi.fn(),
      onDeepLink: vi.fn(),
      onNavigate: vi.fn(),
      onCheckForUpdates: vi.fn(),
      onUpdateStatus: vi.fn(() => vi.fn()),
    };

    renderHook(() => useElectronUpdateStatus(onStatus));

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'Update status read failed:',
        expect.any(Error)
      );
    });
    expect(onStatus).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
