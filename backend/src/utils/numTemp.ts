/** Coerce Prisma Decimal / string / number to a plain number. Defaults to 0.7. */
export function numTemp(value: unknown): number {
  if (value == null) return 0.7;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return Number(value);
}
