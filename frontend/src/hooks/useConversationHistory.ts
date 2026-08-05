/**
 * Conversation message history via React Query (abort on key change).
 */
import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatAPI } from '../services/api';
import type { Message } from '../types/api';
import { queryKeys } from './queryKeys';

export function useConversationHistory(
  conversationId: string | number | null | undefined,
  setError?: Dispatch<SetStateAction<string | null>>
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: conversationId
      ? queryKeys.history(conversationId)
      : ['history', 'none'],
    enabled: Boolean(conversationId),
    queryFn: async ({ signal }) => {
      try {
        if (setError) setError(null);
        const response = await chatAPI.getHistory(
          conversationId as string | number,
          { signal }
        );
        const history = response.data.messages || [];
        return (Array.isArray(history) ? history : []) as Message[];
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'name' in err &&
          (err as { name: string }).name === 'CanceledError'
        ) {
          throw err;
        }
        if (setError) {
          setError('Не вдалося завантажити історію повідомлень');
        }
        throw err;
      }
    },
  });

  const messages = conversationId ? query.data || [] : [];

  const setMessages = useCallback(
    (updater: SetStateAction<Message[]>) => {
      if (!conversationId) return;
      queryClient.setQueryData<Message[]>(
        queryKeys.history(conversationId),
        (prev) => {
          const current = prev || [];
          return typeof updater === 'function' ? updater(current) : updater;
        }
      );
    },
    [conversationId, queryClient]
  );

  return {
    messages,
    setMessages,
    loading: Boolean(conversationId) && query.isLoading,
  };
}
