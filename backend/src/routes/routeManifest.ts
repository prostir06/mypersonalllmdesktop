export const EXPECTED_ROUTE_DOMAINS = [
  'auth',
  'chat',
  'models',
  'settings',
  'conversations',
  'users',
  'documents',
  'prompts',
  'system',
] as const;

export type RouteDomain = (typeof EXPECTED_ROUTE_DOMAINS)[number];
