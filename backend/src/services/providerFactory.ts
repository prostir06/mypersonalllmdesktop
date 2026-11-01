import openaiService from './openaiService';
import ollamaService from './ollamaService';
import geminiService from './geminiService';
import claudeService from './claudeService';
import logger from '../logger';
import { ChatError } from './chat/types';
import type { TokenUsage } from './chat/types';

type SendFn = (
  messages: unknown[],
  model: string,
  options?: Record<string, unknown>
) => Promise<{
  content: string;
  usage?: unknown;
  tokenUsage?: TokenUsage;
  model?: string;
  sources?: unknown[];
}>;

type StreamFn = (
  messages: unknown[],
  model: string,
  options?: Record<string, unknown>,
  onChunk?: (token: string) => void
) => Promise<{
  content: string;
  tokenUsage?: TokenUsage;
  model: string;
  sources?: unknown[];
}>;

type ProviderHandlers = { send: SendFn; stream: StreamFn };

/** Honest public providers only. Unknown names fall back to OpenAI with a warn. */
class ProviderFactory {
  static providers: Record<string, ProviderHandlers> = {
    openai: {
      send: openaiService.sendOpenAIMessage as SendFn,
      stream: openaiService.streamOpenAIMessage as StreamFn,
    },
    ollama: {
      send: ollamaService.sendOllamaMessage as SendFn,
      stream: ollamaService.streamOllamaMessage as StreamFn,
    },
    gemini: {
      send: geminiService.sendGeminiMessage as SendFn,
      stream: geminiService.streamGeminiMessage as StreamFn,
    },
    anthropic: {
      send: claudeService.sendClaudeMessage as SendFn,
      stream: claudeService.streamClaudeMessage as StreamFn,
    },
  };

  static getProvider(name?: string): ProviderHandlers {
    const providerName = (name?.toLowerCase() || 'openai').trim();
    if (this.providers[providerName]) {
      return this.providers[providerName];
    }
    throw new ChatError(400, `Unsupported LLM provider: "${name}"`);
  }

  static async sendMessage(
    provider: string,
    messages: unknown[],
    model: string,
    options: Record<string, unknown> = {}
  ) {
    try {
      const p = this.getProvider(provider);
      logger.info(`Sending message via ${provider} with model ${model}`);
      return await p.send(messages, model, options);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error in ProviderFactory.sendMessage: ${message}`);
      throw error;
    }
  }

  static async streamMessage(
    provider: string,
    messages: unknown[],
    model: string,
    options: Record<string, unknown> = {},
    onChunk?: (token: string) => void
  ) {
    try {
      const p = this.getProvider(provider);
      logger.info(`Streaming message via ${provider} with model ${model}`);
      return await p.stream(messages, model, options, onChunk);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error in ProviderFactory.streamMessage: ${message}`);
      throw error;
    }
  }

  static getAvailableProviders(): string[] {
    return Object.keys(this.providers);
  }
}

export default ProviderFactory;
