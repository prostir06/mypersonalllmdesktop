import React, { useEffect, useState, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, Badge } from 'react-bootstrap';
import { useProductTour } from '../../context/ProductTourContext';

interface ProductTourProps {
  autoStart?: boolean;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const ProductTour: React.FC<ProductTourProps> = ({ autoStart = false }) => {
  const {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    hasNewVersion,
    startTour,
    nextStep,
    prevStep,
    dismissTour,
  } = useProductTour();

  const [rect, setRect] = useState<TargetRect | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Auto-start for new users / new versions if requested (disabled under automated test drivers like Playwright)
  useEffect(() => {
    if (autoStart && hasNewVersion && !isActive) {
      if (typeof navigator !== 'undefined' && navigator.webdriver) {
        return;
      }
      startTour();
    }
  }, [autoStart, hasNewVersion, isActive, startTour]);

  // Position calculation in viewport coordinates
  const updatePosition = useCallback(() => {
    if (!currentStep) return;
    const el = document.querySelector(currentStep.target);
    if (el) {
      const r = el.getBoundingClientRect();
      const next = {
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
      setRect((prev) => {
        if (
          prev &&
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      setRect(null);
    }
  }, [currentStep]);

  useLayoutEffect(() => {
    if (isActive) {
      updatePosition();
      const onResize = () => updatePosition();
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onResize, true);
      const t1 = setTimeout(updatePosition, 100);
      const t2 = setTimeout(updatePosition, 300);
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onResize, true);
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isActive, updatePosition, currentStepIndex]);

  // Keyboard navigation. Typing in a field must not move the tour.
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const target = e.target;
      const editable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      if (editable) return;
      if (e.key === 'Escape') {
        dismissTour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        prevStep();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, nextStep, prevStep, dismissTour]);

  useEffect(() => {
    if (!isActive) return;
    const root = dialogRef.current;
    if (!root) return;
    root.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea')
      );
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || active === root)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => document.removeEventListener('keydown', onTab);
  }, [isActive, currentStepIndex]);

  if (!isActive || !currentStep) return null;

  const PADDING = 6;
  const cutoutX = rect ? Math.max(0, rect.left - PADDING) : 0;
  const cutoutY = rect ? Math.max(0, rect.top - PADDING) : 0;
  const cutoutWidth = rect ? rect.width + PADDING * 2 : 0;
  const cutoutHeight = rect ? rect.height + PADDING * 2 : 0;

  // Popover positioning in viewport coordinates
  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 10000,
    width: 330,
    maxWidth: 'calc(100vw - 32px)',
  };

  if (rect) {
    const isTop = currentStep.placement === 'top';
    const isRight = currentStep.placement === 'right';
    const isLeft = currentStep.placement === 'left';

    if (isRight) {
      popoverStyle.top = Math.max(20, Math.min(window.innerHeight - 250, cutoutY));
      popoverStyle.left = Math.min(window.innerWidth - 350, cutoutX + cutoutWidth + 12);
    } else if (isLeft) {
      popoverStyle.top = Math.max(20, Math.min(window.innerHeight - 250, cutoutY));
      popoverStyle.left = Math.max(20, cutoutX - 342);
    } else if (isTop) {
      popoverStyle.top = Math.max(20, cutoutY - 215);
      popoverStyle.left = Math.max(20, Math.min(window.innerWidth - 350, cutoutX));
    } else {
      // default: bottom
      popoverStyle.top = Math.min(window.innerHeight - 230, cutoutY + cutoutHeight + 12);
      popoverStyle.left = Math.max(20, Math.min(window.innerWidth - 350, cutoutX));
    }
  } else {
    // Fallback: center of screen
    popoverStyle.top = '50%';
    popoverStyle.left = '50%';
    popoverStyle.transform = 'translate(-50%, -50%)';
  }

  const isLast = currentStepIndex === totalSteps - 1;

  return createPortal(
    <div
      className="product-tour-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        pointerEvents: 'auto',
      }}
    >
      {/* SVG Mask Cutout: dark overlay with a transparent hole over the target element */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 9998,
          pointerEvents: 'none',
        }}
      >
        <defs>
          <mask id="product-tour-cutout-mask">
            {/* White reveals the dark backdrop */}
            <rect x="0" y="0" width="100%" height="100%" fill="#ffffff" />
            {/* Black creates a transparent cutout hole for target element */}
            {rect && (
              <rect
                x={cutoutX}
                y={cutoutY}
                width={cutoutWidth}
                height={cutoutHeight}
                rx={8}
                ry={8}
                fill="#000000"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.72)"
          mask="url(#product-tour-cutout-mask)"
          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
          onClick={dismissTour}
        />
      </svg>

      {/* Target element highlight frame with smooth blue glow */}
      {rect && (
        <div
          style={{
            position: 'fixed',
            top: cutoutY,
            left: cutoutX,
            width: cutoutWidth,
            height: cutoutHeight,
            borderRadius: 8,
            border: '2px solid #3b82f6',
            boxShadow: '0 0 16px rgba(59, 130, 246, 0.65), inset 0 0 10px rgba(59, 130, 246, 0.15)',
            pointerEvents: 'none',
            transition: 'all 0.2s ease-out',
            zIndex: 9999,
          }}
        />
      )}

      {/* Glass Panel Popover */}
      <div
        className="glass-panel p-3 border border-secondary shadow-lg text-light"
        style={{
          ...popoverStyle,
          background: 'rgba(25, 27, 31, 0.95)',
          borderRadius: 12,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-secondary opacity-75 small">
              {currentStepIndex + 1} / {totalSteps}
            </span>
            {currentStep.isNew && (
              <Badge bg="primary" className="fw-semibold">
                ✨ Новинка
              </Badge>
            )}
          </div>
          <Button
            variant="link"
            className="p-0 text-muted text-decoration-none"
            onClick={dismissTour}
            title="Закрити тур"
            aria-label="Закрити тур"
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </div>

        <h6 id="product-tour-title" className="fw-bold mb-2 text-white">{currentStep.title}</h6>
        <p className="small text-muted mb-3" style={{ lineHeight: 1.5 }}>
          {currentStep.content}
        </p>

        <div className="d-flex justify-content-between align-items-center pt-2 border-top border-secondary">
          <Button
            variant="link"
            size="sm"
            className="p-0 text-muted text-decoration-none"
            onClick={dismissTour}
          >
            Пропустити
          </Button>
          <div className="d-flex gap-2">
            {currentStepIndex > 0 && (
              <Button variant="outline-secondary" size="sm" onClick={prevStep}>
                Назад
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={nextStep}>
              {isLast ? 'Завершити' : 'Далі →'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ProductTour;
