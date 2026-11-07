import type { AxiosResponse } from 'axios';
import type {
  DocumentChunkRecord,
  DocumentDeleteResponse,
  DocumentRecord,
  DocumentStatusResponse,
  DocumentUploadResponse,
  ListQueryParams,
  PaginatedList,
} from '../../types/api';
import { api } from './client';

export const documentsAPI = {
  getAll: (
    params?: ListQueryParams
  ): Promise<AxiosResponse<PaginatedList<DocumentRecord>>> =>
    api.get('/documents', { params }),
  getStatuses: (
    ids: Array<string | number>
  ): Promise<AxiosResponse<DocumentStatusResponse>> =>
    api.get('/documents/status', { params: { ids: ids.join(',') } }),
  upload: (formData: FormData): Promise<AxiosResponse<DocumentUploadResponse>> =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  delete: (id: string | number): Promise<AxiosResponse<DocumentDeleteResponse>> =>
    api.delete(`/documents/${id}`),
  getChunks: (
    id: string | number,
    params?: ListQueryParams
  ): Promise<AxiosResponse<PaginatedList<DocumentChunkRecord>>> =>
    api.get(`/documents/${id}/chunks`, { params }),
  retry: (id: string | number): Promise<AxiosResponse<DocumentUploadResponse>> =>
    api.post(`/documents/${id}/retry`),
  reindex: (id: string | number): Promise<AxiosResponse<DocumentUploadResponse>> =>
    api.post(`/documents/${id}/reindex`),
};
