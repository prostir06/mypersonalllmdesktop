const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
const MAX_RAW_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

export interface ProcessedImage {
  url: string;
  base64: string;
}

/**
 * Resizes and compresses an image File to ensure it fits within
 * vision model constraints and avoids exceeding backend/network size limits.
 */
export async function processChatImage(file: File): Promise<ProcessedImage> {
  const objectUrl = URL.createObjectURL(file);

  // If file is already small and is a standard web image, check if we need to resize
  if (file.size <= MAX_RAW_BYTES && file.type === 'image/gif') {
    const base64 = await readFileAsDataUrl(file);
    return { url: objectUrl, base64 };
  }

  // Check if browser Image and Canvas APIs are available
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    const base64 = await readFileAsDataUrl(file);
    return { url: objectUrl, base64 };
  }

  return new Promise<ProcessedImage>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;

        // If dimensions exceed max bounds, scale proportionally
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        } else if (file.size <= MAX_RAW_BYTES) {
          // Both dimensions and file size are already small enough
          readFileAsDataUrl(file).then(
            (base64) => resolve({ url: objectUrl, base64 }),
            reject
          );
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback if canvas context fails
          readFileAsDataUrl(file).then(
            (base64) => resolve({ url: objectUrl, base64 }),
            reject
          );
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Prefer JPEG for photos/compressed representation unless PNG transparency is essential
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        let base64 = canvas.toDataURL(mimeType, JPEG_QUALITY);

        // If PNG is still too large (> 3MB), convert to JPEG
        if (mimeType === 'image/png' && base64.length > 3 * 1024 * 1024) {
          base64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        }

        resolve({ url: objectUrl, base64 });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Не вдалося завантажити зображення'));
    };

    img.src = objectUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result || ''));
    reader.onerror = () => reject(new Error('Помилка читання файлу'));
    reader.readAsDataURL(file);
  });
}
