export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStep {
  id: string;
  target: string;
  title: string;
  content: string;
  placement?: TourPlacement;
  isNew?: boolean;
}

export interface TourContextValue {
  isActive: boolean;
  currentStepIndex: number;
  currentStep: TourStep | null;
  totalSteps: number;
  hasNewVersion: boolean;
  startTour: (stepId?: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  dismissTour: () => void;
}
