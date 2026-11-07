process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
import { inviteExpiry } from '../services/admin/invites';

describe('inviteExpiry', () => {
  const now = new Date('2026-11-07T12:00:00.000Z');

  it('defaults to 72 hours and caps at 14 days', () => {
    expect(inviteExpiry(undefined, now).toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(inviteExpiry(24 * 40, now).toISOString()).toBe('2026-11-21T12:00:00.000Z');
  });
});
