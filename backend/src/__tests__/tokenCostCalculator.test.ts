import { calculateTokenCost } from '../utils/tokenCostCalculator';

describe('tokenCostCalculator', () => {
  it('calculates cost for gpt-4o-mini', () => {
    // 1000 prompt tokens ($0.15/1M) = $0.00015
    // 1000 completion tokens ($0.60/1M) = $0.00060 -> sum = $0.00075
    const cost = calculateTokenCost('gpt-4o-mini', 1000, 1000);
    expect(cost).toBeCloseTo(0.00075, 5);
  });

  it('matches gpt-4o-mini dated variant accurately instead of gpt-4o', () => {
    const miniCost = calculateTokenCost('gpt-4o-mini-2024-07-18', 1000, 1000);
    expect(miniCost).toBeCloseTo(0.00075, 5);

    // gpt-4o is $2.50 / $10.00 -> 1000 + 1000 = $0.0025 + $0.010 = $0.0125
    const fullCost = calculateTokenCost('gpt-4o-2024-08-06', 1000, 1000);
    expect(fullCost).toBeCloseTo(0.0125, 5);
  });

  it('calculates cost for claude-3-5-sonnet with or without date suffix', () => {
    // 1000 prompt tokens ($3.00/1M) = $0.003
    // 1000 completion tokens ($15.00/1M) = $0.015 -> sum = $0.018
    const costFull = calculateTokenCost('claude-3-5-sonnet-20241022', 1000, 1000);
    const costAlias = calculateTokenCost('claude-3-5-sonnet', 1000, 1000);
    const costDot = calculateTokenCost('claude-3.5-sonnet', 1000, 1000);
    expect(costFull).toBeCloseTo(0.018, 5);
    expect(costAlias).toBeCloseTo(0.018, 5);
    expect(costDot).toBeCloseTo(0.018, 5);
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

  it('returns undefined for non-string, null or undefined model', () => {
    expect(calculateTokenCost(undefined as unknown as string, 1000, 1000)).toBeUndefined();
    expect(calculateTokenCost(null as unknown as string, 1000, 1000)).toBeUndefined();
    expect(calculateTokenCost('' as unknown as string, 1000, 1000)).toBeUndefined();
  });

  it('returns undefined for unknown models', () => {
    const cost = calculateTokenCost('custom-unknown-model-xyz', 1000, 1000);
    expect(cost).toBeUndefined();
  });

  it('does not price a model from a substring of a known id', () => {
    expect(calculateTokenCost('sonnet', 1000, 1000)).toBeUndefined();
    expect(calculateTokenCost('4o', 1000, 1000)).toBeUndefined();
    expect(calculateTokenCost('mini', 1000, 1000)).toBeUndefined();
  });
});
