/** Shared React Query keys for server state. */
export const queryKeys = {
  settings: ['settings'] as const,
  conversations: ['conversations'] as const,
  history: (id: string | number) => ['history', id] as const,
  documents: ['documents'] as const,
  models: ['models'] as const,
};
