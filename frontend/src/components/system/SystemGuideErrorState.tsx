import React from 'react';
import { Button } from 'react-bootstrap';

type Props = { onRetry?: () => void };

/** Shown instead of the guide tabs when knowledge failed to load. */
const SystemGuideErrorState: React.FC<Props> = ({ onRetry }) => (
  <div
    className="d-flex flex-column align-items-center justify-content-center p-5 text-center"
    role="alert"
  >
    <div className="fs-1 mb-2">⚠️</div>
    <h6 className="fw-bold">Не вдалося завантажити дані про систему</h6>
    <p className="text-muted small">
      Перевірте з'єднання із сервером і спробуйте ще раз.
    </p>
    {onRetry && (
      <Button variant="outline-warning" size="sm" onClick={onRetry}>
        Повторити
      </Button>
    )}
  </div>
);

export default SystemGuideErrorState;
