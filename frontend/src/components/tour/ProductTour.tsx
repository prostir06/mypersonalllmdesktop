import React, { useEffect, useState, useLayoutEffect, useCallback } from 'react';
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

  // Auto-start for new users / new versions if requested
  useEffect(() => {
    if (autoStart && hasNewVersion && !isActive) {
      startTour();
    }
  }, [autoStart, hasNewVersion, isActive, startTour]);

  // Position calculation and viewport clamping
  const updatePosition = useCallback(() => {
    if (!currentStep) return;
    const el = document.querySelector(currentStep.target);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({
        top: Math.max(0, r.top + window.scrollY),
        left: Math.max(0, r.left + window.scrollX),
        width: r.width,
        height: r.height,
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
      window.addEventListener('scroll', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onResize);
      };
    }
  }, [isActive, updatePosition]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
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

  if (!isActive || !currentStep) return null;

  // Popover positioning
  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    width: 320,
    maxWidth: '90vw',
  };

  if (rect) {
    const isTop = currentStep.placement === 'top';
    const isRight = currentStep.placement === 'right';

    if (isRight) {
      popoverStyle.top = Math.max(20, Math.min(window.innerHeight - 250, rect.top - window.scrollY));
      popoverStyle.left = Math.min(window.innerWidth - 340, rect.left + rect.width + 12);
    } else if (isTop) {
      popoverStyle.top = Math.max(20, rect.top - window.scrollY - 210);
      popoverStyle.left = Math.max(20, Math.min(window.innerWidth - 340, rect.left));
    } else {
      popoverStyle.top = Math.min(window.innerHeight - 230, rect.top - window.scrollY + rect.height + 12);
      popoverStyle.left = Math.max(20, Math.min(window.innerWidth - 340, rect.left));
    }
  } else {
    // Fallback: center of screen
    popoverStyle.top = '50%';
    popoverStyle.left = '50%';
    popoverStyle.transform = 'translate(-50%, -50%)';
  }

  const isLast = currentStepIndex === totalSteps - 1;

  return createPortal(
    <div className="product-tour-root" style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'auto' }}>
      {/* Semi-transparent Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(2px)',
        }}
        onClick={dismissTour}
      />

      {/* Spotlight highlight over target */}
      {rect && (
        <div
          style={{
            position: 'absolute',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: 8,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65), 0 0 15px #0d6efd',
            pointerEvents: 'none',
            transition: 'all 0.25s ease-out',
            zIndex: 9998,
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
        aria-label="Product Tour Step"
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
            ✕
          </Button>
        </div>

        <h6 className="fw-bold mb-2 text-white">{currentStep.title}</h6>
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
