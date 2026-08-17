import type { AxiosResponse } from 'axios';
import type {
  SuccessResponse,
  UserPrompt,
  UserPromptCreatePayload,
  UserPromptUpdatePayload,
} from '../../types/api';
import { api } from './client';

export const promptsAPI = {
  getAll: (): Promise<AxiosResponse<UserPrompt[]>> => api.get('/prompts'),
  create: (
    payload: UserPromptCreatePayload
  ): Promise<AxiosResponse<UserPrompt>> => api.post('/prompts', payload),
  update: (
    id: number,
    payload: UserPromptUpdatePayload
  ): Promise<AxiosResponse<UserPrompt>> => api.put(`/prompts/${id}`, payload),
  delete: (id: number): Promise<AxiosResponse<SuccessResponse>> =>
    api.delete(`/prompts/${id}`),
};
