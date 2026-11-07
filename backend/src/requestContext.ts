import { AsyncLocalStorage } from 'async_hooks';

export type RequestLogContext = {
  requestId: string;
};

export const requestContext = new AsyncLocalStorage<RequestLogContext>();
