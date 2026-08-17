import type { AxiosResponse } from 'axios';
import type {
  Conversation,
  ConversationExportResponse,
  ListQueryParams,
  PaginatedList,
  SuccessResponse,
} from '../../types/api';
import { api } from './client';

export const conversationAPI = {
  getAll: (
    params?: ListQueryParams
  ): Promise<AxiosResponse<PaginatedList<Conversation>>> =>
    api.get('/conversations', { params }),
  create: (title: string): Promise<AxiosResponse<Conversation>> =>
    api.post('/conversations', { title }),
  update: (id: string | number, title: string): Promise<AxiosResponse<Conversation>> =>
    api.put(`/conversations/${id}`, { title }),
  delete: (id: string | number): Promise<AxiosResponse<SuccessResponse>> =>
    api.delete(`/conversations/${id}`),
  export: (
    id: string | number,
    format: string = 'md'
  ): Promise<AxiosResponse<ConversationExportResponse>> =>
    api.get(`/conversations/${id}/export`, { params: { format } }),
};
