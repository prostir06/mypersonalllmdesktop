import { evaluateSafeMathExpression } from '../utils/safeMath';

describe('evaluateSafeMathExpression', () => {
  it('evaluates + - * / and parentheses with precedence', () => {
    expect(evaluateSafeMathExpression('1+2*3')).toBe(7);
    expect(evaluateSafeMathExpression('(1+2)*3')).toBe(9);
    expect(evaluateSafeMathExpression('10 / 4')).toBe(2.5);
    expect(evaluateSafeMathExpression('-3 + 5')).toBe(2);
    expect(evaluateSafeMathExpression('2 + 2')).toBe(4);
  });

  it('rejects identifiers and dangerous input', () => {
    expect(() => evaluateSafeMathExpression('process.exit(1)')).toThrow();
    expect(() => evaluateSafeMathExpression('2**3')).toThrow();
    expect(() => evaluateSafeMathExpression('')).toThrow();
    expect(() => evaluateSafeMathExpression('1+')).toThrow();
  });

  it('rejects division by zero', () => {
    expect(() => evaluateSafeMathExpression('1/0')).toThrow(/zero/i);
  });
});
