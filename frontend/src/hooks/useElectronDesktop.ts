/**
 * Deep link + update IPC listeners for the Electron shell.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  type ElectronNavigatePayload,
  isElectronApp,
  navigateToDeepLink,
  type UpdateStatus,
} from '../types/electron';

export function useElectronShellListeners(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isElectronApp() || !window.electron) return;

    const unsubNavigate = window.electron.onNavigate(
      (payload: ElectronNavigatePayload) => {
        if (payload.path) navigate(payload.path);
      }
    );
    const unsubCheckForUpdates = window.electron.onCheckForUpdates(() => {
      toast.info('Перевіряємо оновлення…');
    });

    return () => {
      unsubNavigate();
      unsubCheckForUpdates();
    };
  }, [navigate]);
}

export function useElectronDeepLinks(enabled: boolean): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !isElectronApp() || !window.electron) return;

    const apply = (payload: { type: string; conversationId: string }) => {
      navigateToDeepLink(
        { type: 'chat', conversationId: payload.conversationId },
        navigate
      );
    };

    void window.electron.getPendingDeepLink().then((pending) => {
      if (pending) apply(pending);
    });

    const unsubDeepLink = window.electron.onDeepLink(apply);
    return () => {
      unsubDeepLink();
    };
  }, [enabled, navigate]);
}

export function useElectronUpdateStatus(
  onStatus?: (status: UpdateStatus) => void
): void {
  useEffect(() => {
    if (!isElectronApp() || !window.electron || !onStatus) return;

    void window.electron.getUpdateStatus().then(onStatus);
    return window.electron.onUpdateStatus(onStatus);
  }, [onStatus]);
}
