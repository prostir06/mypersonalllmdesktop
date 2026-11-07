import axios from 'axios';
import { loadOllamaShowCapabilities } from '../services/ollama/showCapabilities';
import {
  clearRuntimeModelCapabilitiesCache,
  modelSupportsTools,
  modelSupportsVision,
} from '../utils/modelCapabilities';

jest.mock('../logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('loadOllamaShowCapabilities', () => {
  beforeEach(() => {
    clearRuntimeModelCapabilitiesCache();
    jest.restoreAllMocks();
  });

  it('caches vision and tools from /api/show for ten minutes of lookups', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { capabilities: ['completion', 'vision', 'tools'] },
    });

    const flags = await loadOllamaShowCapabilities('gemma4:latest', 'http://127.0.0.1:11434');

    expect(flags).toEqual({ vision: true, tools: true, webSearchGrounding: false });
    expect(modelSupportsVision('gemma4:latest', 'ollama')).toBe(true);
    expect(modelSupportsTools('gemma4:latest', 'ollama')).toBe(true);

    await loadOllamaShowCapabilities('gemma4:latest', 'http://127.0.0.1:11434');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when Ollama is unreachable so name heuristics can apply', async () => {
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('connect ECONNREFUSED'));

    const flags = await loadOllamaShowCapabilities('llava:latest', 'http://127.0.0.1:11434');

    expect(flags).toBeUndefined();
    expect(modelSupportsVision('llava:latest', 'ollama')).toBe(true);
  });
});
