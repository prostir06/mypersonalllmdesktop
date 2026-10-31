import { useQuery } from '@tanstack/react-query';
import { systemAPI } from '../services/api';
import type { SystemKnowledgeQueryParams } from '../types/api';
import { queryKeys } from './queryKeys';

export function useSystemKnowledge(
  params?: SystemKnowledgeQueryParams,
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.systemKnowledge(params),
    queryFn: async () => {
      const response = await systemAPI.getKnowledge(params);
      return response.data;
    },
    enabled,
    staleTime: 1000 * 30,
  });
}
