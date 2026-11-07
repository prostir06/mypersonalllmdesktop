import type { AxiosResponse } from 'axios';
import type { UserProfile, UserUpdatePayload } from '../../types/api';
import { api } from './client';

export type UserMemoryNote = {
  id: number;
  user_id: number;
  content: string;
  created_at: string;
  updated_at: string;
};

export const usersAPI = {
  getMe: (): Promise<AxiosResponse<UserProfile>> => api.get('/users/me'),
  updateMe: (data: UserUpdatePayload): Promise<AxiosResponse<UserProfile>> =>
    api.put('/users/me', data),
  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<AxiosResponse<{ ok: boolean }>> => api.post('/users/me/password', data),
  listMemoryNotes: (): Promise<AxiosResponse<{ notes: UserMemoryNote[] }>> =>
    api.get('/users/me/memory-notes'),
  createMemoryNote: (
    content: string
  ): Promise<AxiosResponse<UserMemoryNote>> =>
    api.post('/users/me/memory-notes', { content }),
  updateMemoryNote: (
    noteId: string | number,
    content: string
  ): Promise<AxiosResponse<UserMemoryNote>> =>
    api.patch(`/users/me/memory-notes/${noteId}`, { content }),
  deleteMemoryNote: (
    noteId: string | number
  ): Promise<AxiosResponse<void>> =>
    api.delete(`/users/me/memory-notes/${noteId}`),
};
