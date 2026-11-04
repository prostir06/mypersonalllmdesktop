import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CURRENT_TOUR_VERSION, productTourSteps, TOUR_STORAGE_KEY } from '../config/tourSteps';
import type { TourContextValue, TourStep } from '../types/tour';

const ProductTourContext = createContext<TourContextValue | null>(null);

export const ProductTourProvider: React.FC<{ children: React.ReactNode; steps?: TourStep[] }> = ({
  children,
  steps = productTourSteps,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [savedVersion, setSavedVersion] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const hasNewVersion = useMemo(() => {
    return savedVersion !== CURRENT_TOUR_VERSION;
  }, [savedVersion]);

  const startTour = useCallback((stepId?: string) => {
    if (stepId) {
      const idx = steps.findIndex((s) => s.id === stepId);
      setCurrentStepIndex(idx >= 0 ? idx : 0);
    } else {
      setCurrentStepIndex(0);
    }
    setIsActive(true);
  }, [steps]);

  const dismissTour = useCallback(() => {
    setIsActive(false);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, CURRENT_TOUR_VERSION);
      setSavedVersion(CURRENT_TOUR_VERSION);
    } catch (storageErr: unknown) {
      // Storage might be restricted in private browsing / sandboxed iframes
      console.warn('ProductTourContext: localStorage access failed:', storageErr);
    }
  }, []);

  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      dismissTour();
    }
  }, [currentStepIndex, steps.length, dismissTour]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  const currentStep = useMemo(() => {
    return isActive && steps[currentStepIndex] ? steps[currentStepIndex] : null;
  }, [isActive, steps, currentStepIndex]);

  const value = useMemo<TourContextValue>(() => ({
    isActive,
    currentStepIndex,
    currentStep,
    totalSteps: steps.length,
    hasNewVersion,
    startTour,
    nextStep,
    prevStep,
    dismissTour,
  }), [isActive, currentStepIndex, currentStep, steps.length, hasNewVersion, startTour, nextStep, prevStep, dismissTour]);

  return (
    <ProductTourContext.Provider value={value}>
      {children}
    </ProductTourContext.Provider>
  );
};

export function useProductTour(): TourContextValue {
  const ctx = useContext(ProductTourContext);
  if (!ctx) {
    throw new Error('useProductTour must be used within a ProductTourProvider');
  }
  return ctx;
}
