import { calculateTokenCost } from '../utils/tokenCostCalculator';

describe('tokenCostCalculator', () => {
  it('calculates cost for gpt-4o-mini', () => {
    // 1000 prompt tokens ($0.15/1M) = $0.00015
    // 1000 completion tokens ($0.60/1M) = $0.00060 -> sum = $0.00075
    const cost = calculateTokenCost('gpt-4o-mini', 1000, 1000);
    expect(cost).toBeCloseTo(0.00075, 5);
  });

  it('calculates cost for gemini-2.0-flash', () => {
    // 1000 prompt tokens ($0.10/1M) = $0.00010
    // 1000 completion tokens ($0.40/1M) = $0.00040 -> sum = $0.00050
    const cost = calculateTokenCost('gemini-2.0-flash', 1000, 1000);
    expect(cost).toBeCloseTo(0.0005, 5);
  });

  it('returns 0 for local ollama models', () => {
    const cost = calculateTokenCost('llama3:latest', 2500, 500);
    expect(cost).toBe(0);
  });

  it('returns undefined for unknown models', () => {
    const cost = calculateTokenCost('custom-unknown-model-xyz', 1000, 1000);
    expect(cost).toBeUndefined();
  });
});
