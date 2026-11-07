export type UserRole = 'admin' | 'member';

export function adminEmail(): string | null {
  const raw = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return raw || null;
}

/** ADMIN_EMAIL is the bootstrap admin. Without it, the first account is admin. */
export function resolveRegistrationRole(email: string, existingUsers: number): UserRole {
  const configured = adminEmail();
  if (configured) {
    return email.trim().toLowerCase() === configured ? 'admin' : 'member';
  }
  return existingUsers <= 0 ? 'admin' : 'member';
}
