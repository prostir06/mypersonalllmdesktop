const axios = require('axios');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const sendOpenAIMessage = async (messages, model = 'gpt-3.5-turbo', options = {}) => {
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

    const response = await axios.post(OPENAI_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage,
      model: response.data.model
    };
  } catch (error) {
    console.error('OpenAI API error:', error.response?.data || error.message);
    throw new Error('Failed to communicate with OpenAI API');
  }
};

const streamOpenAIMessage = async (messages, model = 'gpt-3.5-turbo', options = {}, onChunk) => {
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

    const response = await axios.post(OPENAI_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
    console.error('OpenAI Stream API error:', error.response?.data || error.message);
    throw new Error('Failed to stream from OpenAI API');
  }
};

module.exports = {
  sendOpenAIMessage,
  streamOpenAIMessage
};
