import type { AxiosResponse } from 'axios';
import type {
  AuthRefreshResponse,
  AuthTokenResponse,
  SuccessResponse,
} from '../../types/api';
import { api } from './client';

export const authAPI = {
  login: (email: string, password: string): Promise<AxiosResponse<AuthTokenResponse>> =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name: string): Promise<AxiosResponse<AuthTokenResponse>> =>
    api.post('/auth/register', { email, password, name }),
  refresh: (): Promise<AxiosResponse<AuthRefreshResponse>> =>
    api.post('/auth/refresh'),
  logout: (): Promise<AxiosResponse<SuccessResponse>> => api.post('/auth/logout'),
};
