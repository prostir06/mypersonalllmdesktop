import type { AxiosResponse } from 'axios';
import type {
  ModelCreatePayload,
  ModelRecord,
  ModelUpdatePayload,
  RemoteModelOption,
  SuccessResponse,
} from '../../types/api';
import { api } from './client';

export const modelsAPI = {
  getAll: (): Promise<AxiosResponse<ModelRecord[]>> => api.get('/models'),
  getRemote: (
    provider: string,
    host?: string
  ): Promise<AxiosResponse<RemoteModelOption[] | { models?: RemoteModelOption[] }>> =>
    api.get('/models/remote', { params: { provider, host } }),
  create: (model: ModelCreatePayload): Promise<AxiosResponse<ModelRecord>> =>
    api.post('/models', model),
  update: (
    id: string | number,
    model: ModelUpdatePayload
  ): Promise<AxiosResponse<ModelRecord>> => api.put(`/models/${id}`, model),
  delete: (id: string | number): Promise<AxiosResponse<SuccessResponse>> =>
    api.delete(`/models/${id}`),
};
