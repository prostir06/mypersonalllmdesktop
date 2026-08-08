/**
 * Whether POST /auth/register is allowed.
 * ALLOW_REGISTRATION=true|false overrides; if unset, allow outside production.
 */
export function isRegistrationAllowed(): boolean {
  const raw = process.env.ALLOW_REGISTRATION;
  if (raw !== undefined && String(raw).trim() !== '') {
    const v = String(raw).trim().toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(v);
  }
  return process.env.NODE_ENV !== 'production';
}
