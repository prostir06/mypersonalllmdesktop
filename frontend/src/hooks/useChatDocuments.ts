/**
 * RAG documents list / upload / selection — paginated list in React Query.
 */
import {
  useCallback,
  useEffect,
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
import type { DocumentRecord, PaginatedList } from '../types/api';

const PAGE_SIZE = 50;

/** Auto-select after upload only when already ready (pending waits for poll). */
export function shouldSelectDocumentOnUpload(
  status?: string | null
): boolean {
  return status === 'ready';
}

function pageHasPending(
  data: { pages: PaginatedList<DocumentRecord>[] } | undefined
): boolean {
  return Boolean(
    data?.pages.some((page) =>
      page.items.some((doc) => doc.status === 'pending')
    )
  );
}

export function useChatDocuments() {
  const queryClient = useQueryClient();
  const [selectedDocIds, setSelectedDocIds] = useState<Array<string | number>>(
    []
  );
  const [showDocModal, setShowDocModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const statusByIdRef = useRef<Map<string | number, string>>(new Map());

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
    refetchInterval: (query) =>
      pageHasPending(query.state.data) ? 1500 : false,
  });

  const userDocuments = useMemo(
    () => documentsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [documentsQuery.data]
  );

  useEffect(() => {
    for (const doc of userDocuments) {
      const status = String(doc.status || 'ready');
      const prev = statusByIdRef.current.get(doc.id);
      if (prev === 'pending' && status === 'ready') {
        toast.success(`Файл "${doc.filename || doc.id}" готовий до RAG`);
        setSelectedDocIds((ids) =>
          ids.includes(doc.id) ? ids : [...ids, doc.id]
        );
      } else if (prev === 'pending' && status === 'failed') {
        toast.error(
          `Індексація "${doc.filename || doc.id}" не вдалася. Видаліть файл і спробуйте знову.`
        );
      }
      statusByIdRef.current.set(doc.id, status);
    }
  }, [userDocuments]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await documentsAPI.upload(formData);
      return { fileName: file.name, ...res.data };
    },
    onSuccess: (data) => {
      toast.info(
        `📄 Файл "${data.fileName}" прийнято. Індексація виконується у фоні…`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      // Select only when already ready; pending waits for poll toast above.
      if (
        data.document?.id &&
        shouldSelectDocumentOnUpload(data.document.status)
      ) {
        setSelectedDocIds((prev) => [...prev, data.document.id]);
      }
      if (data.document?.id) {
        statusByIdRef.current.set(
          data.document.id,
          String(data.document.status || 'pending')
        );
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
      statusByIdRef.current.delete(docId);
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
