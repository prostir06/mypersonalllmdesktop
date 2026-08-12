/**
 * Desktop app updates (Electron shell only).
 */
import React, { useCallback, useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import { isElectronApp, type UpdateStatus } from '../../types/electron';
import { useElectronUpdateStatus } from '../../hooks/useElectronDesktop';

function statusLabel(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Оновлення не перевірялись';
    case 'checking':
      return 'Перевірка оновлень…';
    case 'available':
      return `Доступна версія ${status.version}`;
    case 'not-available':
      return 'У вас остання версія';
    case 'downloading':
      return `Завантаження… ${status.percent}%`;
    case 'downloaded':
      return `Версія ${status.version} готова до встановлення`;
    case 'error':
      return `Помилка: ${status.message}`;
    default:
      return '';
  }
}

const DesktopUpdatesCard = () => {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [checking, setChecking] = useState(false);

  useElectronUpdateStatus(setStatus);

  const handleCheck = useCallback(async () => {
    if (!window.electron) return;
    setChecking(true);
    try {
      const next = await window.electron.checkForUpdates();
      setStatus(next);
    } finally {
      setChecking(false);
    }
  }, []);

  const handleInstall = useCallback(async () => {
    await window.electron?.quitAndInstall();
  }, []);

  if (!isElectronApp()) return null;

  return (
    <div className="glass-panel p-4 mb-3">
      <h6
        className="fw-semibold mb-3 text-muted text-uppercase"
        style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
      >
        Desktop — оновлення
      </h6>
      <p className="text-muted small mb-3">{statusLabel(status)}</p>

      {status.state === 'error' && (
        <Alert variant="warning" className="py-2 small">
          {status.message}
        </Alert>
      )}

      {status.state === 'downloaded' && (
        <Alert variant="success" className="py-2 small">
          Оновлення завантажено. Перезапустіть застосунок, щоб встановити.
        </Alert>
      )}

      <div className="d-flex flex-wrap gap-2">
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => void handleCheck()}
          disabled={checking || status.state === 'checking'}
        >
          {checking || status.state === 'checking' ? (
            <>
              <Spinner size="sm" animation="border" className="me-2" />
              Перевірка…
            </>
          ) : (
            'Перевірити оновлення'
          )}
        </Button>
        {status.state === 'downloaded' && (
          <Button variant="primary" size="sm" onClick={() => void handleInstall()}>
            Перезапустити та встановити
          </Button>
        )}
      </div>
    </div>
  );
};

export default DesktopUpdatesCard;
