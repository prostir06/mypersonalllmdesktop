/** Max decoded image payload accepted in chat options.image (bytes). */
export const MAX_CHAT_IMAGE_BYTES = 4 * 1024 * 1024;

const DATA_IMAGE_RE =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i;

/**
 * Accept only data:image/*;base64,... URLs under size cap.
 * Rejects http(s) and other schemes (no remote fetch via provider).
 */
export function assertChatImage(image: unknown): asserts image is string {
  if (typeof image !== 'string' || !image.trim()) {
    throw new Error('Некоректне зображення у запиті');
  }

  const trimmed = image.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error(
      'Віддалені URL зображень заборонені. Використовуйте локальне вкладення.'
    );
  }

  const match = DATA_IMAGE_RE.exec(trimmed);
  if (!match) {
    throw new Error(
      'Дозволені лише data:image (png/jpeg/webp/gif) у форматі base64'
    );
  }

  const b64 = match[2].replace(/\s/g, '');
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const approxBytes = Math.floor((b64.length * 3) / 4) - padding;
  if (approxBytes > MAX_CHAT_IMAGE_BYTES) {
    throw new Error(
      `Зображення перевищує ліміт (${MAX_CHAT_IMAGE_BYTES} байт)`
    );
  }
}
