import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminTeamTab from './AdminTeamTab';

const listUsers = vi.fn();
const spend = vi.fn();
const listInvites = vi.fn();
const updateUser = vi.fn();
const createInvite = vi.fn();

vi.mock('../../services/api/admin', () => ({
  adminAPI: {
    listUsers: (...args: unknown[]) => listUsers(...args),
    spend: (...args: unknown[]) => spend(...args),
    listInvites: (...args: unknown[]) => listInvites(...args),
    updateUser: (...args: unknown[]) => updateUser(...args),
    createInvite: (...args: unknown[]) => createInvite(...args),
  },
}));

describe('AdminTeamTab', () => {
  beforeEach(() => {
    listUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: 2,
            name: 'Mia',
            email: 'm@b.com',
            role: 'member',
            blocked: false,
            sharedKeyDailyLimitUsd: null,
          },
        ],
      },
    });
    spend.mockResolvedValue({ data: { rows: [] } });
    listInvites.mockResolvedValue({ data: { invites: [] } });
    updateUser.mockResolvedValue({ data: { user: {} } });
  });

  it('saves a role change', async () => {
    const user = userEvent.setup();
    render(<AdminTeamTab />);
    expect(await screen.findByText('m@b.com')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Роль m@b.com'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(2, {
        role: 'admin',
        blocked: false,
        sharedKeyDailyLimitUsd: null,
      });
    });
  });
});
