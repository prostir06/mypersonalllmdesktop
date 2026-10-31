/**
 * React Query hooks for user settings.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsAPI } from '../services/api';
import type { SettingsUpdatePayload, UserSettings } from '../types/api';
import { queryKeys } from './queryKeys';

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => {
      const response = await settingsAPI.get();
      return response.data as UserSettings;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SettingsUpdatePayload) => {
      const res = await settingsAPI.update(data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.settings, data);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.systemKnowledgeAll,
      });
    },
  });
}
