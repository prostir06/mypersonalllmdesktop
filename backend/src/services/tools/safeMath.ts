import { ToolValidationError } from './types';

/**
 * Safely evaluates basic mathematical expressions (+, -, *, /, %, ^, ()).
 * Strictly forbids eval(), Function(), letters, and unexpected tokens.
 */
export function evaluateSafeMathExpression(expr: string): number {
  if (typeof expr !== 'string') throw new ToolValidationError('Expression must be a string');
  const trimmed = expr.trim();
  if (!trimmed) throw new ToolValidationError('Expression cannot be empty');
  if (/[^0-9.+*/%^()\s-]/.test(trimmed)) throw new ToolValidationError('Expression contains disallowed characters');

  type Token = { type: 'NUM' | 'OP' | 'LP' | 'RP'; val: string };
  const tokens: Token[] = [];
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')') { tokens.push({ type: ch === '(' ? 'LP' : 'RP', val: ch }); i++; continue; }
    if (['+', '-', '*', '/', '%', '^'].includes(ch)) { tokens.push({ type: 'OP', val: ch }); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let numStr = '', dots = 0;
      while (i < trimmed.length && /[0-9.]/.test(trimmed[i])) {
        if (trimmed[i] === '.') dots++;
        numStr += trimmed[i++];
      }
      if (dots > 1 || numStr === '.') throw new ToolValidationError(`Invalid number format: "${numStr}"`);
      tokens.push({ type: 'NUM', val: numStr });
      continue;
    }
    throw new ToolValidationError(`Unexpected character: "${ch}"`);
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = (exp?: string) => {
    const t = tokens[pos];
    if (!t) throw new ToolValidationError('Unexpected end of expression');
    if (exp && t.val !== exp) throw new ToolValidationError(`Expected "${exp}", found "${t.val}"`);
    pos++;
    return t;
  };
  const parseExpr = (): number => {
    let left = parseTerm();
    while (pos < tokens.length && peek()?.type === 'OP' && ['+', '-'].includes(peek()!.val)) {
      const op = consume().val;
      left = op === '+' ? left + parseTerm() : left - parseTerm();
    }
    return left;
  };
  const parseTerm = (): number => {
    let left = parsePower();
    while (pos < tokens.length && peek()?.type === 'OP' && ['*', '/', '%'].includes(peek()!.val)) {
      const op = consume().val;
      const right = parsePower();
      if (op === '*') left *= right;
      else if (op === '/') {
        if (right === 0) throw new ToolValidationError('Division by zero');
        left /= right;
      } else {
        if (right === 0) throw new ToolValidationError('Division by zero in modulo operation');
        left %= right;
      }
    }
    return left;
  };
  const parsePower = (): number => {
    let left = parseFactor();
    if (pos < tokens.length && peek()?.type === 'OP' && peek()?.val === '^') {
      consume();
      left = Math.pow(left, parsePower());
    }
    return left;
  };
  const parseFactor = (): number => {
    if (peek()?.type === 'OP' && ['+', '-'].includes(peek()!.val)) {
      return consume().val === '-' ? -parseFactor() : parseFactor();
    }
    return parsePrimary();
  };
  const parsePrimary = (): number => {
    const t = peek();
    if (!t) throw new ToolValidationError('Unexpected end of expression');
    if (t.type === 'NUM') {
      consume();
      const val = Number(t.val);
      if (Number.isNaN(val)) throw new ToolValidationError(`Invalid number: ${t.val}`);
      return val;
    }
    if (t.type === 'LP') {
      consume('(');
      const val = parseExpr();
      consume(')');
      return val;
    }
    throw new ToolValidationError(`Unexpected token: "${t.val}"`);
  };

  const res = parseExpr();
  if (pos < tokens.length) throw new ToolValidationError(`Unexpected token after expression: "${tokens[pos].val}"`);
  if (!Number.isFinite(res)) throw new ToolValidationError('Calculation produced non-finite result');
  return res;
}
