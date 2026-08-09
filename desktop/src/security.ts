/**
 * Allowlist check for in-app navigations (Electron will-navigate).
 */
export function isAllowedAppOrigin(
  url: string,
  allowedOrigins: Iterable<string>
): boolean {
  try {
    const origin = new URL(url).origin;
    for (const allowed of allowedOrigins) {
      if (origin === allowed) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Baseline CSP for packaged static UI (API is same-origin via /api proxy). */
export const UI_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.gravatar.com; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
