/**
 * React Query hooks for conversation list CRUD.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { conversationAPI } from '../services/api';
import type { Conversation } from '../types/api';
import { queryKeys } from './queryKeys';

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async () => {
      const response = await conversationAPI.getAll();
      return (response.data || []) as Conversation[];
    },
    staleTime: 1000 * 30,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const response = await conversationAPI.create(title);
      return response.data as Conversation;
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations,
        (prev) => [created, ...(prev || [])]
      );
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | number) => {
      await conversationAPI.delete(id);
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations,
        (prev) => (prev || []).filter((c) => c.id !== id)
      );
      queryClient.removeQueries({ queryKey: queryKeys.history(id) });
    },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      title,
    }: {
      id: string | number;
      title: string;
    }) => {
      await conversationAPI.update(id, title);
      return { id, title };
    },
    onSuccess: ({ id, title }) => {
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations,
        (prev) =>
          (prev || []).map((c) => (c.id === id ? { ...c, title } : c))
      );
    },
  });
}

/** Invalidate conversation list after a chat turn that may create/update titles. */
export function useInvalidateConversations() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
}

/** Select first conversation when list loads and nothing is active. */
export function useAutoSelectConversation(
  conversations: Conversation[] | undefined,
  activeId: string | number | null,
  setActiveId: (id: string | number | null) => void
) {
  useEffect(() => {
    if (activeId != null) return;
    if (conversations && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId, setActiveId]);
}
