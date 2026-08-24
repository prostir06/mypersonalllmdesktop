export function nowMs(): number {
  return Date.now();
}

export function elapsedMs(startMs: number): number {
  return Date.now() - startMs;
}
