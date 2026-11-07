/**
 * React Query hooks for conversation list CRUD (paginated).
 */
import { useCallback, useEffect, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { chatAPI, conversationAPI } from '../services/api';
import type { Conversation } from '../types/api';
import { queryKeys } from './queryKeys';
import { nextListOffset } from '../utils/listPagination';

const PAGE_SIZE = 50;

export function useConversations() {
  const query = useInfiniteQuery({
    queryKey: queryKeys.conversations,
    queryFn: async ({ pageParam }) => {
      const response = await conversationAPI.getAll({
        limit: PAGE_SIZE,
        offset: pageParam,
      });
      return response.data;
    },
    initialPageParam: 0,
    getNextPageParam: (last) => nextListOffset(last),
    staleTime: 1000 * 30,
  });

  const conversations = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  );
  const loadMore = useCallback(() => {
    void query.fetchNextPage();
  }, [query.fetchNextPage]);

  return {
    ...query,
    conversations,
    hasMore: Boolean(query.hasNextPage),
    loadMore,
  };
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const response = await conversationAPI.create(title);
      return response.data as Conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useTogglePinConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: string | number | { id: string | number; is_pinned?: boolean }
    ) => {
      const id = typeof args === 'object' ? args.id : args;
      const isPinned = typeof args === 'object' ? args.is_pinned : undefined;
      const response = await chatAPI.togglePin(id, isPinned);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

/** Invalidate conversation list after a chat turn that may create/update titles. */
export function useInvalidateConversations() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
    [queryClient]
  );
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
