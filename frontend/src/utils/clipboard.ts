import { toast } from 'react-toastify';

/**
 * Copy text; toast only after write succeeds (avoids false "copied" success).
 */
export function copyTextWithToast(
  text: string,
  successMessage: string
): void {
  void navigator.clipboard.writeText(text).then(
    () => {
      toast.success(successMessage, { autoClose: 1500 });
    },
    (err: unknown) => {
      console.warn('Clipboard write failed:', err);
      toast.error('Не вдалося скопіювати');
    }
  );
}
