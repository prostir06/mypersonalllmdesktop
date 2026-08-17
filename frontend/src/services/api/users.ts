import type { AxiosResponse } from 'axios';
import type { UserProfile, UserUpdatePayload } from '../../types/api';
import { api } from './client';

export const usersAPI = {
  getMe: (): Promise<AxiosResponse<UserProfile>> => api.get('/users/me'),
  updateMe: (data: UserUpdatePayload): Promise<AxiosResponse<UserProfile>> =>
    api.put('/users/me', data),
};
