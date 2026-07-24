const { sendOpenAIMessage, streamOpenAIMessage } = require('./openaiService');
const { sendOllamaMessage, streamOllamaMessage } = require('./ollamaService');
const logger = require('../logger');

class ProviderFactory {
  static providers = {
    openai: { send: sendOpenAIMessage, stream: streamOpenAIMessage },
    chatgpt: { send: sendOpenAIMessage, stream: streamOpenAIMessage },
    gpt: { send: sendOpenAIMessage, stream: streamOpenAIMessage },
    microsoft: { send: sendOpenAIMessage, stream: streamOpenAIMessage },
    copilot: { send: sendOpenAIMessage, stream: streamOpenAIMessage },
    google: { send: sendOpenAIMessage, stream: streamOpenAIMessage },
    ollama: { send: sendOllamaMessage, stream: streamOllamaMessage }
  };

  static getProvider(name) {
    const providerName = name?.toLowerCase() || 'openai';
    return this.providers[providerName] || this.providers.openai;
  }

  static async sendMessage(provider, messages, model, options = {}) {
    try {
      const p = this.getProvider(provider);
      logger.info(`Sending message via ${provider} with model ${model}`);
      return await p.send(messages, model, options);
    } catch (error) {
      logger.error(`Error in ProviderFactory.sendMessage: ${error.message}`);
      throw error;
    }
  }

  static async streamMessage(provider, messages, model, options = {}, onChunk) {
    try {
      const p = this.getProvider(provider);
      logger.info(`Streaming message via ${provider} with model ${model}`);
      return await p.stream(messages, model, options, onChunk);
    } catch (error) {
      logger.error(`Error in ProviderFactory.streamMessage: ${error.message}`);
      throw error;
    }
  }

  static getAvailableProviders() {
    return Object.keys(this.providers);
  }
}

module.exports = ProviderFactory;
