import type { RagSource, TokenUsage } from '../chat/types';

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export type ProviderMessage = {
  role: string;
  content?: unknown;
};

export interface NormalizedToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface ToolDefinitionSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ModelCapabilityFlags {
  vision: boolean;
  tools: boolean;
  webSearchGrounding: boolean;
}

export interface ProviderSendResult {
  content: string;
  usage?: unknown;
  tokenUsage?: TokenUsage;
  model: string;
  sources?: RagSource[];
  toolCalls?: NormalizedToolCall[];
}
