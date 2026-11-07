import type { AxiosResponse } from 'axios';
import { api } from './client';

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'member';
  blocked: boolean;
  sharedKeyDailyLimitUsd: number | null;
  created_at: string;
};

export type SpendRow = {
  userId: number;
  email: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
};

export type InviteRow = {
  id: number;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

export const adminAPI = {
  listUsers: (): Promise<AxiosResponse<{ users: AdminUser[] }>> =>
    api.get('/admin/users'),
  updateUser: (
    id: number,
    patch: {
      role?: 'admin' | 'member';
      blocked?: boolean;
      sharedKeyDailyLimitUsd?: number | null;
    }
  ): Promise<AxiosResponse<{ user: AdminUser }>> =>
    api.patch(`/admin/users/${id}`, patch),
  spend: (period: 'day' | 'month'): Promise<AxiosResponse<{ estimate: boolean; rows: SpendRow[] }>> =>
    api.get('/admin/spend', { params: { period } }),
  listInvites: (): Promise<AxiosResponse<{ invites: InviteRow[] }>> =>
    api.get('/admin/invites'),
  createInvite: (): Promise<AxiosResponse<{ token: string; expiresAt: string }>> =>
    api.post('/admin/invites', {}),
};
