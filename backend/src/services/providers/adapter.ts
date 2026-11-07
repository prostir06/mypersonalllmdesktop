import { getModelCapabilities } from '../../utils/modelCapabilities';
import type {
  ModelCapabilityFlags,
  ProviderMessage,
  ProviderSendResult,
} from './types';

export type ProviderCallOptions = Record<string, unknown> & {
  model: string;
};

export interface ProviderAdapter {
  send(
    messages: ProviderMessage[],
    opts: ProviderCallOptions,
    signal?: AbortSignal
  ): Promise<ProviderSendResult>;
  stream(
    messages: ProviderMessage[],
    opts: ProviderCallOptions,
    signal: AbortSignal | undefined,
    onToken?: (token: string) => void
  ): Promise<ProviderSendResult>;
  capabilities(model: string): ModelCapabilityFlags;
}

type SendFn = (
  messages: ProviderMessage[],
  model?: string,
  options?: Record<string, unknown>
) => Promise<ProviderSendResult>;

type StreamFn = (
  messages: ProviderMessage[],
  model?: string,
  options?: Record<string, unknown>,
  onToken?: (token: string) => void
) => Promise<ProviderSendResult>;

function serviceOptions(opts: ProviderCallOptions, signal?: AbortSignal): Record<string, unknown> {
  const requestSignal = signal ?? (opts.signal instanceof AbortSignal ? opts.signal : undefined);
  const { model: _model, signal: _signal, ...rest } = opts;
  return requestSignal ? { ...rest, signal: requestSignal } : rest;
}

export function createProviderAdapter(
  provider: string,
  send: SendFn,
  stream: StreamFn
): ProviderAdapter {
  return {
    capabilities(model: string) {
      return getModelCapabilities(model, provider);
    },
    send(messages, opts, signal) {
      return send(messages, opts.model, serviceOptions(opts, signal));
    },
    stream(messages, opts, signal, onToken) {
      return stream(messages, opts.model, serviceOptions(opts, signal), onToken);
    },
  };
}

export function readAbortSignal(options: Record<string, unknown>): AbortSignal | undefined {
  return options.signal instanceof AbortSignal ? options.signal : undefined;
}
