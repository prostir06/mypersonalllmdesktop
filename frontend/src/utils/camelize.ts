/** Recursive snake_case → camelCase for JSON objects. Leaves strings and dates alone. */
export function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const camel = key.replace(/_([a-z])/g, (_all, letter: string) => letter.toUpperCase());
      out[camel] = camelizeKeys(nested);
    }
    return out;
  }
  return value;
}
