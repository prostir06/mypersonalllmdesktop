const RELOAD_KEY = 'vite-preload-reloaded';

/** Reload once after a stale hashed chunk 404. A second failure stays on the page. */
export function recoverFromPreloadError(
  event: Event,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void
): void {
  event.preventDefault();
  if (storage.getItem(RELOAD_KEY)) return;
  storage.setItem(RELOAD_KEY, '1');
  reload();
}
