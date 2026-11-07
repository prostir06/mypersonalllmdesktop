import openaiService from './openaiService';
import ollamaService from './ollamaService';
import geminiService from './geminiService';
import claudeService from './claudeService';
import logger from '../logger';
import { ChatError } from './chat/types';
import type { ProviderMessage, ProviderSendResult } from './providers/types';

type SendFn = (
  messages: ProviderMessage[],
  model?: string,
  options?: Record<string, unknown>
) => Promise<ProviderSendResult>;

type StreamFn = (
  messages: ProviderMessage[],
  model?: string,
  options?: Record<string, unknown>,
  onChunk?: (token: string) => void
) => Promise<ProviderSendResult>;

type ProviderHandlers = { send: SendFn; stream: StreamFn };

class ProviderFactory {
  static providers: Record<string, ProviderHandlers> = {
    openai: {
      send: openaiService.sendOpenAIMessage,
      stream: openaiService.streamOpenAIMessage,
    },
    ollama: {
      send: ollamaService.sendOllamaMessage,
      stream: ollamaService.streamOllamaMessage,
    },
    gemini: {
      send: geminiService.sendGeminiMessage,
      stream: geminiService.streamGeminiMessage,
    },
    anthropic: {
      send: claudeService.sendClaudeMessage,
      stream: claudeService.streamClaudeMessage,
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
    messages: ProviderMessage[],
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
    messages: ProviderMessage[],
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
