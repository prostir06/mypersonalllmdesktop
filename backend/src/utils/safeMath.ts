/**
 * Safe arithmetic evaluator for the calculate tool.
 * Supports + - * / ( ) and decimal numbers only — no Function/eval.
 */

export function evaluateSafeMathExpression(input: string): number {
  const src = input.trim();
  if (!src) {
    throw new Error('Empty expression');
  }
  if (src.includes('**') || src.includes('^')) {
    throw new Error('Exponentiation not allowed');
  }
  if (/[^0-9+\-*/().\s]/.test(src)) {
    throw new Error('Invalid characters in expression');
  }

  let i = 0;

  function peek(): string | undefined {
    while (i < src.length && /\s/.test(src[i])) i += 1;
    return i < src.length ? src[i] : undefined;
  }

  function parseNumber(): number {
    const start = i;
    while (i < src.length && /\d/.test(src[i])) i += 1;
    if (i < src.length && src[i] === '.') {
      i += 1;
      while (i < src.length && /\d/.test(src[i])) i += 1;
    }
    if (start === i) {
      throw new Error('Expected number');
    }
    const n = Number(src.slice(start, i));
    if (!Number.isFinite(n)) {
      throw new Error('Invalid number');
    }
    return n;
  }

  function parseFactor(): number {
    const ch = peek();
    if (ch === '+') {
      i += 1;
      return parseFactor();
    }
    if (ch === '-') {
      i += 1;
      return -parseFactor();
    }
    if (ch === '(') {
      i += 1;
      const value = parseExpression();
      if (peek() !== ')') {
        throw new Error('Expected closing parenthesis');
      }
      i += 1;
      return value;
    }
    return parseNumber();
  }

  function parseTerm(): number {
    let value = parseFactor();
    let op = peek();
    while (op === '*' || op === '/') {
      i += 1;
      const right = parseFactor();
      if (op === '*') {
        value *= right;
      } else {
        if (right === 0) {
          throw new Error('Division by zero');
        }
        value /= right;
      }
      op = peek();
    }
    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();
    let op = peek();
    while (op === '+' || op === '-') {
      i += 1;
      const right = parseTerm();
      value = op === '+' ? value + right : value - right;
      op = peek();
    }
    return value;
  }

  const result = parseExpression();
  if (peek() !== undefined) {
    throw new Error('Unexpected trailing input');
  }
  if (!Number.isFinite(result)) {
    throw new Error('Non-finite result');
  }
  return result;
}
