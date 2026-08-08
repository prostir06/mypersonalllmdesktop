/**
 * RAG documents list / upload / selection — paginated list in React Query.
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type { AxiosError } from 'axios';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { documentsAPI } from '../services/api';
import { queryKeys } from './queryKeys';
import { nextListOffset } from '../utils/listPagination';

const PAGE_SIZE = 50;

export function useChatDocuments() {
  const queryClient = useQueryClient();
  const [selectedDocIds, setSelectedDocIds] = useState<Array<string | number>>(
    []
  );
  const [showDocModal, setShowDocModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const documentsQuery = useInfiniteQuery({
    queryKey: queryKeys.documents,
    queryFn: async ({ pageParam }) => {
      const res = await documentsAPI.getAll({
        limit: PAGE_SIZE,
        offset: pageParam,
      });
      return res.data;
    },
    initialPageParam: 0,
    getNextPageParam: (last) => nextListOffset(last),
    staleTime: 1000 * 60,
  });

  const userDocuments = useMemo(
    () => documentsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [documentsQuery.data]
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await documentsAPI.upload(formData);
      return { fileName: file.name, ...res.data };
    },
    onSuccess: (data) => {
      toast.success(
        `📄 Файл "${data.fileName}" опрацьовано! Створено ${data.chunksCount} чанків.`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      if (data.document?.id) {
        setSelectedDocIds((prev) => [...prev, data.document.id]);
      }
    },
    onError: (err: unknown) => {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка завантаження файлу');
    },
    onSettled: () => {
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string | number) => {
      await documentsAPI.delete(docId);
      return docId;
    },
    onSuccess: (docId) => {
      setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      toast.info('Файл видалено.');
    },
  });

  const handleFileUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadMutation.mutateAsync(file);
    },
    [uploadMutation]
  );

  const handleToggleDoc = useCallback(
    (docId: string | number, checked: boolean) => {
      setSelectedDocIds((prev) =>
        checked ? [...prev, docId] : prev.filter((id) => id !== docId)
      );
    },
    []
  );

  const handleDeleteDoc = useCallback(
    async (docId: string | number) => {
      await deleteMutation.mutateAsync(docId);
    },
    [deleteMutation]
  );

  return {
    userDocuments,
    selectedDocIds,
    showDocModal,
    setShowDocModal,
    uploadingDoc: uploadMutation.isPending,
    fileInputRef,
    handleFileUpload,
    handleToggleDoc,
    handleDeleteDoc,
    hasMoreDocuments: Boolean(documentsQuery.hasNextPage),
    loadMoreDocuments: () => documentsQuery.fetchNextPage(),
    loadingMoreDocuments: documentsQuery.isFetchingNextPage,
  };
}
