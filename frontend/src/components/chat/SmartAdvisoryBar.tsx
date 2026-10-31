import React, { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import type { AdvisoryTip } from '../../types/api';

export interface SmartAdvisoryBarProps {
  advisories: AdvisoryTip[];
  versionHash?: string;
  onAction: (tip: AdvisoryTip) => void;
}

const isTipDismissed = (tipId: string, versionHash?: string): boolean => {
  try {
    return (
      sessionStorage.getItem(
        `smart_advisory_dismissed:${tipId}:${versionHash || 'v0'}`
      ) === 'true'
    );
  } catch {
    return false;
  }
};

const SmartAdvisoryBar: React.FC<SmartAdvisoryBarProps> = ({
  advisories,
  versionHash,
  onAction,
}) => {
  const [dismissTrigger, setDismissTrigger] = useState(0);

  const activeTip = useMemo(() => {
    if (!advisories || advisories.length === 0) return null;

    const sorted = [...advisories].sort((a, b) => {
      if (a.severity === 'warning' && b.severity !== 'warning') return -1;
      if (a.severity !== 'warning' && b.severity === 'warning') return 1;
      return 0;
    });

    return sorted.find((tip) => !isTipDismissed(tip.id, versionHash)) || null;
  }, [advisories, versionHash, dismissTrigger]);

  if (!activeTip) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(
        `smart_advisory_dismissed:${activeTip.id}:${versionHash || 'v0'}`,
        'true'
      );
    } catch {
      // sessionStorage might be restricted in some environments
    }
    setDismissTrigger((prev) => prev + 1);
  };

  const isWarning = activeTip.severity === 'warning';

  return (
    <div
      className={`d-flex align-items-center justify-content-between p-2 mb-2 rounded border ${
        isWarning
          ? 'bg-warning bg-opacity-10 border-warning text-light'
          : 'bg-info bg-opacity-10 border-info text-light'
      }`}
      role="region"
      aria-label="Порада системи"
    >
      <div className="d-flex align-items-center gap-2 overflow-hidden text-truncate me-2">
        <span className="fs-6">{isWarning ? '⚠️' : '💡'}</span>
        <span className="small text-truncate">
          <strong>{activeTip.title}</strong> — {activeTip.message}
        </span>
      </div>
      <div className="d-flex align-items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant={isWarning ? 'warning' : 'outline-info'}
          onClick={() => onAction(activeTip)}
          className="py-0 px-2"
        >
          {activeTip.actionLabel}
        </Button>
        <Button
          variant="link"
          size="sm"
          className="p-0 text-light text-decoration-none fs-5 lh-1 ms-1"
          aria-label="Приховати пораду"
          onClick={handleDismiss}
        >
          &times;
        </Button>
      </div>
    </div>
  );
};

export default React.memo(SmartAdvisoryBar);
