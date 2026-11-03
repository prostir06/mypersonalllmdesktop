import { describe, it, expect } from 'vitest';
import { productTourSteps, CURRENT_TOUR_VERSION, TOUR_STORAGE_KEY } from './tourSteps';

describe('tourSteps configuration', () => {
  it('defines valid CURRENT_TOUR_VERSION and TOUR_STORAGE_KEY', () => {
    expect(CURRENT_TOUR_VERSION).toBe('v18.1');
    expect(TOUR_STORAGE_KEY).toBe('product_tour_completed_version');
  });

  it('contains at least 6 distinct steps with required fields', () => {
    expect(productTourSteps.length).toBeGreaterThanOrEqual(6);
    productTourSteps.forEach((step) => {
      expect(step.id).toBeTruthy();
      expect(step.target).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.content).toBeTruthy();
    });
  });

  it('marks tools-toggle and web-search-toggle as isNew', () => {
    const tools = productTourSteps.find((s) => s.id === 'tools-toggle');
    const web = productTourSteps.find((s) => s.id === 'web-search-toggle');
    expect(tools?.isNew).toBe(true);
    expect(web?.isNew).toBe(true);
  });
});
