import type { AxiosResponse } from 'axios';
import type {
  SystemKnowledgeQueryParams,
  SystemKnowledgeResponse,
} from '../../types/api';
import { api } from './client';

export const systemAPI = {
  getKnowledge: (
    params?: SystemKnowledgeQueryParams
  ): Promise<AxiosResponse<SystemKnowledgeResponse>> =>
    api.get('/system/knowledge', { params }),
};
