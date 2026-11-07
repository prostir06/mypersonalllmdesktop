import { isSafeExternalUrl } from './security';

export async function openExternalIfSafe(
  url: string,
  open: (url: string) => Promise<void>
): Promise<boolean> {
  if (!isSafeExternalUrl(url)) return false;
  await open(url);
  return true;
}
