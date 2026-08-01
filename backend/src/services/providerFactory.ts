import openaiService = require('./openaiService');
import ollamaService = require('./ollamaService');
import logger from '../logger';

type SendFn = (
  messages: unknown[],
  model: string,
  options?: Record<string, unknown>
) => Promise<{ content: string; usage?: unknown; model?: string }>;

type StreamFn = (
  messages: unknown[],
  model: string,
  options?: Record<string, unknown>,
  onChunk?: (token: string) => void
) => Promise<{ content: string; model: string }>;

type ProviderHandlers = { send: SendFn; stream: StreamFn };

class ProviderFactory {
  static providers: Record<string, ProviderHandlers> = {
    openai: {
      send: openaiService.sendOpenAIMessage as SendFn,
      stream: openaiService.streamOpenAIMessage as StreamFn,
    },
    chatgpt: {
      send: openaiService.sendOpenAIMessage as SendFn,
      stream: openaiService.streamOpenAIMessage as StreamFn,
    },
    gpt: {
      send: openaiService.sendOpenAIMessage as SendFn,
      stream: openaiService.streamOpenAIMessage as StreamFn,
    },
    microsoft: {
      send: openaiService.sendOpenAIMessage as SendFn,
      stream: openaiService.streamOpenAIMessage as StreamFn,
    },
    copilot: {
      send: openaiService.sendOpenAIMessage as SendFn,
      stream: openaiService.streamOpenAIMessage as StreamFn,
    },
    google: {
      send: openaiService.sendOpenAIMessage as SendFn,
      stream: openaiService.streamOpenAIMessage as StreamFn,
    },
    ollama: {
      send: ollamaService.sendOllamaMessage as SendFn,
      stream: ollamaService.streamOllamaMessage as StreamFn,
    },
  };

  static getProvider(name?: string): ProviderHandlers {
    const providerName = name?.toLowerCase() || 'openai';
    return this.providers[providerName] || this.providers.openai;
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

export = ProviderFactory;
