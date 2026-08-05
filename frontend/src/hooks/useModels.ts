/**
 * React Query hooks for LLM model catalog CRUD.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { modelsAPI } from '../services/api';
import type {
  ModelCreatePayload,
  ModelRecord,
  ModelUpdatePayload,
} from '../types/api';
import { queryKeys } from './queryKeys';

export function useModels() {
  return useQuery({
    queryKey: queryKeys.models,
    queryFn: async () => {
      const res = await modelsAPI.getAll();
      return (res.data || []) as ModelRecord[];
    },
    staleTime: 1000 * 30,
  });
}

export function useCreateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ModelCreatePayload) => {
      const res = await modelsAPI.create(payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
    },
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string | number;
      payload: ModelUpdatePayload;
    }) => {
      const res = await modelsAPI.update(id, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | number) => {
      await modelsAPI.delete(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
    },
  });
}

export function isSystemModel(m: ModelRecord): boolean {
  return m.user_id == null || m.is_default === true;
}
