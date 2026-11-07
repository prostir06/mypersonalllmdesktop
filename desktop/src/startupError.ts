/** User-facing text when the packaged UI or backend cannot be opened. */
export function unavailableDialogMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  return `Не вдалося відкрити інтерфейс.\n\n${detail}`;
}
