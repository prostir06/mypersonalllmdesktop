import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductTourProvider, useProductTour } from './ProductTourContext';
import { TOUR_STORAGE_KEY } from '../config/tourSteps';

describe('ProductTourContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('warns and still starts when localStorage read throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProductTourProvider>{children}</ProductTourProvider>
    );
    const { result } = renderHook(() => useProductTour(), { wrapper });
    expect(result.current.hasNewVersion).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'ProductTourContext: localStorage read failed:',
      expect.any(Error)
    );
    warn.mockRestore();
    vi.restoreAllMocks();
  });

  it('detects new user when storage key is empty', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProductTourProvider>{children}</ProductTourProvider>
    );
    const { result } = renderHook(() => useProductTour(), { wrapper });
    expect(result.current.hasNewVersion).toBe(true);
  });

  it('starts tour and navigates next/prev', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProductTourProvider>{children}</ProductTourProvider>
    );
    const { result } = renderHook(() => useProductTour(), { wrapper });

    act(() => {
      result.current.startTour();
    });
    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStepIndex).toBe(0);

    act(() => {
      result.current.nextStep();
    });
    expect(result.current.currentStepIndex).toBe(1);

    act(() => {
      result.current.prevStep();
    });
    expect(result.current.currentStepIndex).toBe(0);
  });

  it('saves current tour version on dismiss', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProductTourProvider>{children}</ProductTourProvider>
    );
    const { result } = renderHook(() => useProductTour(), { wrapper });

    act(() => {
      result.current.startTour();
      result.current.dismissTour();
    });

    expect(result.current.isActive).toBe(false);
    expect(localStorage.getItem(TOUR_STORAGE_KEY)).toBe('v18.1');
    expect(result.current.hasNewVersion).toBe(false);
  });
});
