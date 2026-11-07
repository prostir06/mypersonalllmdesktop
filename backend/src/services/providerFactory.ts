import openaiService from './openaiService';
import ollamaService from './ollamaService';
import geminiService from './geminiService';
import claudeService from './claudeService';
import logger from '../logger';
import { ChatError } from './chat/types';
import { createProviderAdapter, readAbortSignal } from './providers/adapter';
import type { ProviderAdapter } from './providers/adapter';
import type { ProviderMessage, ProviderSendResult } from './providers/types';

class ProviderFactory {
  static providers: Record<string, ProviderAdapter> = {
    openai: createProviderAdapter(
      'openai',
      openaiService.sendOpenAIMessage,
      openaiService.streamOpenAIMessage
    ),
    ollama: createProviderAdapter(
      'ollama',
      ollamaService.sendOllamaMessage,
      ollamaService.streamOllamaMessage
    ),
    gemini: createProviderAdapter(
      'gemini',
      geminiService.sendGeminiMessage,
      geminiService.streamGeminiMessage
    ),
    anthropic: createProviderAdapter(
      'anthropic',
      claudeService.sendClaudeMessage,
      claudeService.streamClaudeMessage
    ),
  };

  static getProvider(name?: string): ProviderAdapter {
    const providerName = (name?.toLowerCase() || 'openai').trim();
    const adapter = this.providers[providerName];
    if (adapter) return adapter;
    throw new ChatError(400, `Unsupported LLM provider: "${name}"`);
  }

  static async sendMessage(
    provider: string,
    messages: ProviderMessage[],
    model: string,
    options: Record<string, unknown> = {}
  ): Promise<ProviderSendResult> {
    try {
      const adapter = this.getProvider(provider);
      logger.info(`Sending message via ${provider} with model ${model}`);
      return await adapter.send(messages, { ...options, model }, readAbortSignal(options));
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
  ): Promise<ProviderSendResult> {
    try {
      const adapter = this.getProvider(provider);
      logger.info(`Streaming message via ${provider} with model ${model}`);
      return await adapter.stream(
        messages,
        { ...options, model },
        readAbortSignal(options),
        onChunk
      );
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
