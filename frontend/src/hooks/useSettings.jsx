/**
 * React Query hooks for user settings.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { queryKeys } from './queryKeys';

export const useSettings = () => {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

export const useUpdateSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => api.put('/settings', data),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.settings, data.data);
    },
  });
};
