import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { usersAPI, type UserMemoryNote } from '../services/api/users';
import { queryKeys } from './queryKeys';

const MAX_USER_NOTES = 30;

function readApiError(error: unknown, fallback: string): string {
  const ax = error as AxiosError<{ error?: string }>;
  return ax?.response?.data?.error || ax?.message || fallback;
}

export function useUserMemory() {
  const queryClient = useQueryClient();
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.userMemoryNotes,
    queryFn: async () => {
      const res = await usersAPI.listMemoryNotes();
      return res.data.notes ?? [];
    },
  });

  const notes = query.data ?? [];

  const setNotesCache = useCallback(
    (updater: (prev: UserMemoryNote[]) => UserMemoryNote[]) => {
      queryClient.setQueryData<UserMemoryNote[]>(
        queryKeys.userMemoryNotes,
        (prev) => updater(prev ?? [])
      );
    },
    [queryClient]
  );

  const createNote = useCallback(
    async (content: string) => {
      setMutating(true);
      setMutationError(null);
      try {
        const res = await usersAPI.createMemoryNote(content);
        setNotesCache((prev) => [...prev, res.data]);
        return res.data;
      } catch (e: unknown) {
        setMutationError(readApiError(e, 'Не вдалося створити нотатку'));
        return null;
      } finally {
        setMutating(false);
      }
    },
    [setNotesCache]
  );

  const updateNote = useCallback(
    async (noteId: string | number, content: string) => {
      setMutating(true);
      setMutationError(null);
      try {
        const res = await usersAPI.updateMemoryNote(noteId, content);
        setNotesCache((prev) =>
          prev.map((n) => (n.id === res.data.id ? res.data : n))
        );
        return res.data;
      } catch (e: unknown) {
        setMutationError(readApiError(e, 'Не вдалося оновити нотатку'));
        return null;
      } finally {
        setMutating(false);
      }
    },
    [setNotesCache]
  );

  const deleteNote = useCallback(
    async (noteId: string | number) => {
      setMutating(true);
      setMutationError(null);
      try {
        await usersAPI.deleteMemoryNote(noteId);
        setNotesCache((prev) => prev.filter((n) => n.id !== Number(noteId)));
        return true;
      } catch (e: unknown) {
        setMutationError(readApiError(e, 'Не вдалося видалити нотатку'));
        return false;
      } finally {
        setMutating(false);
      }
    },
    [setNotesCache]
  );

  return {
    notes,
    loading: query.isLoading,
    mutating,
    error: mutationError || (query.error ? readApiError(query.error, 'Помилка завантаження') : null),
    maxNotes: MAX_USER_NOTES,
    createNote,
    updateNote,
    deleteNote,
  };
}
