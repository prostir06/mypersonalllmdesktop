const axios = require('axios');

const DEFAULT_OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/v1/chat/completions';

const sendOllamaMessage = async (messages, model = 'llama2', options = {}) => {
  try {
    const { ollama_host, ...payloadOptions } = options;
    const payload = {
      model,
      messages,
      temperature: payloadOptions.temperature || 0.7,
      max_tokens: payloadOptions.max_tokens || 2000,
      top_p: payloadOptions.top_p || 1,
      ...payloadOptions
    };

    const apiUrl = ollama_host || DEFAULT_OLLAMA_API_URL;
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage,
      model: response.data.model
    };
  } catch (error) {
    console.error('Ollama API error:', error.response?.data || error.message);
    throw new Error('Failed to communicate with Ollama API');
  }
};

const streamOllamaMessage = async (messages, model = 'llama2', options = {}, onChunk) => {
  try {
    const { ollama_host, ...payloadOptions } = options;
    const payload = {
      model,
      messages,
      temperature: payloadOptions.temperature || 0.7,
      max_tokens: payloadOptions.max_tokens || 2000,
      top_p: payloadOptions.top_p || 1,
      stream: true,
      ...payloadOptions
    };

    const apiUrl = ollama_host || DEFAULT_OLLAMA_API_URL;
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    });

    let fullContent = '';

    return new Promise((resolve, reject) => {
      let buffer = '';
      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.replace('data: ', '');
            if (dataStr === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(dataStr);
              const token = parsed.choices[0]?.delta?.content || '';
              if (token) {
                fullContent += token;
                if (onChunk) onChunk(token);
              }
            } catch (e) {
              // ignore partial line parse errors
            }
          }
        }
      });

      response.data.on('end', () => {
        resolve({ content: fullContent, model });
      });

      response.data.on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    console.error('Ollama Stream API error:', error.response?.data || error.message);
    throw new Error('Failed to stream from Ollama API');
  }
};

module.exports = {
  sendOllamaMessage,
  streamOllamaMessage
};
