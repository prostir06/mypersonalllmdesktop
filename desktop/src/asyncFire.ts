/**
 * Fire-and-forget with an explicit rejection handler (avoids silent unhandledrejection).
 */
export function fireAndForget(
  promise: Promise<unknown>,
  onError: (err: unknown) => void
): void {
  void promise.catch(onError);
}
