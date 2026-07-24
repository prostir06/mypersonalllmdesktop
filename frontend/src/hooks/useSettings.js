// frontend/src/hooks/useSettings.js - НОВИЙ ФАЙЛ
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export const useSettings = () => {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 хвилин
  });
};

export const useUpdateSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => api.put('/settings', data),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data.data);
    },
  });
};

export const useConversations = () => {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await api.get('/conversations');
      return response.data;
    },
    staleTime: 1000 * 60 * 2, // 2 хвилини
  });
};

export const useCreateConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title) => api.post('/conversations', { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

export const useDeleteConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId) => api.delete(`/conversations/${conversationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

export const useChatHistory = (conversationId) => {
  return useQuery({
    queryKey: ['chatHistory', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const response = await api.get(`/chat/history/${conversationId}`);
      return response.data.messages || [];
    },
    enabled: !!conversationId,
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => api.post('/chat/send', data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory', variables.conversationId] });
    },
  });
};
