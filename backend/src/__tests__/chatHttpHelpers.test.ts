jest.mock('../utils/geminiKeyResolver', () => ({
  resolveGeminiApiKey: jest.fn(),
}));

jest.mock('../utils/openaiKeyResolver', () => ({
  resolveOpenAiApiKey: jest.fn(),
}));

jest.mock('../utils/claudeKeyResolver', () => ({
  resolveClaudeApiKey: jest.fn(),
}));

jest.mock('../services/chat/ownership', () => ({
  ensureConversationId: jest.fn().mockResolvedValue(101),
}));

jest.mock('../services/chat/history', () => ({
  loadRecentMessages: jest.fn().mockResolvedValue([]),
  loadAllRawMessages: jest.fn().mockResolvedValue([]),
}));

jest.mock('../services/chat/systemContext', () => ({
  buildSystemContext: jest.fn().mockResolvedValue({
    messages: [],
    sources: [],
    ragStatus: 'skipped',
  }),
  buildDateTimeMessage: jest.fn().mockReturnValue({
    role: 'system',
    content: 'TIME',
  }),
}));

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    message: { findFirst: jest.fn() },
    conversation: { findFirst: jest.fn(), create: jest.fn() },
  },
}));

import {
  isChatError,
  publicStreamErrorText,
  publicErrorJson,
} from '../services/chat/httpHelpers';
import { prepareMessages } from '../services/chat/prepare';
import { resolveGeminiApiKey } from '../utils/geminiKeyResolver';
import { resolveOpenAiApiKey } from '../utils/openaiKeyResolver';
import { resolveClaudeApiKey } from '../utils/claudeKeyResolver';
import { sendMessage, streamMessage } from '../controllers/chatController';
import ChatService from '../services/ChatService';
import type { AuthRequest } from '../types/express';
import type { Response } from 'express';

describe('chat httpHelpers', () => {
  const prev = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = prev;
  });

  it('isChatError detects statusCode', () => {
    expect(
      isChatError(Object.assign(new Error('x'), { statusCode: 403 }))
    ).toBe(true);
    expect(isChatError(new Error('x'))).toBe(false);
  });

  it('publicStreamErrorText masks in production', () => {
    process.env.NODE_ENV = 'production';
    expect(publicStreamErrorText('secret')).toBe('Stream failed');
    process.env.NODE_ENV = 'test';
    expect(publicStreamErrorText('secret')).toBe('secret');
  });

  it('publicErrorJson omits details in production', () => {
    process.env.NODE_ENV = 'production';
    const body = publicErrorJson(
      { id: 'r1' } as { id?: string },
      'Failed',
      'secret'
    );
    expect(body).toEqual({ error: 'Failed', requestId: 'r1' });
  });
});

describe('prepareMessages Gemini integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveGeminiApiKey as jest.Mock).mockResolvedValue(null);
    (resolveOpenAiApiKey as jest.Mock).mockResolvedValue(null);
    (resolveClaudeApiKey as jest.Mock).mockResolvedValue(null);
  });

  it('calls resolveGeminiApiKey when input.provider is gemini and assigns options.apiKey', async () => {
    (resolveGeminiApiKey as jest.Mock).mockResolvedValue('test-gemini-key');

    const prepared = await prepareMessages({
      userId: 42,
      conversationId: 101,
      message: 'Hello Gemini',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    });

    expect(resolveGeminiApiKey).toHaveBeenCalledWith(42);
    expect(resolveOpenAiApiKey).not.toHaveBeenCalled();
    expect(resolveClaudeApiKey).not.toHaveBeenCalled();
    expect(prepared.options.apiKey).toBe('test-gemini-key');
  });

  it('calls resolveClaudeApiKey when input.provider is anthropic and assigns options.apiKey', async () => {
    (resolveClaudeApiKey as jest.Mock).mockResolvedValue('test-claude-key');

    const prepared = await prepareMessages({
      userId: 42,
      conversationId: 101,
      message: 'Hello Claude',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    });

    expect(resolveClaudeApiKey).toHaveBeenCalledWith(42);
    expect(resolveGeminiApiKey).not.toHaveBeenCalled();
    expect(resolveOpenAiApiKey).not.toHaveBeenCalled();
    expect(prepared.options.apiKey).toBe('test-claude-key');
  });

  it('calls resolveOpenAiApiKey when input.provider is not gemini nor anthropic', async () => {
    (resolveOpenAiApiKey as jest.Mock).mockResolvedValue('test-openai-key');

    const prepared = await prepareMessages({
      userId: 42,
      conversationId: 101,
      message: 'Hello OpenAI',
      provider: 'openai',
      model: 'gpt-3.5-turbo',
    });

    expect(resolveOpenAiApiKey).toHaveBeenCalledWith(42);
    expect(resolveGeminiApiKey).not.toHaveBeenCalled();
    expect(resolveClaudeApiKey).not.toHaveBeenCalled();
    expect(prepared.options.apiKey).toBe('test-openai-key');
  });

  it('preserves and propagates options.enableWebSearch when provided in input.options', async () => {
    (resolveGeminiApiKey as jest.Mock).mockResolvedValue('test-gemini-key');

    const prepared = await prepareMessages({
      userId: 42,
      conversationId: 101,
      message: 'Search for news',
      provider: 'gemini',
      options: { enableWebSearch: true },
    });

    expect(prepared.options.enableWebSearch).toBe(true);
  });
});

describe('chatController enableWebSearch propagation', () => {
  function mockRes(): Response {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      writableEnded: false,
    } as unknown as Response;
  }

  it('passes req.body.enableWebSearch to ChatService.sendMessage', async () => {
    const sendSpy = jest.spyOn(ChatService, 'sendMessage').mockResolvedValueOnce({
      conversationId: 101,
      messageId: 1,
      content: 'hello',
      role: 'assistant',
      timestamp: new Date(),
      sources: [],
    } as any);

    const req = {
      id: 'rid-1',
      userId: 42,
      body: {
        message: 'Search query',
        provider: 'gemini',
        enableWebSearch: true,
      },
    } as AuthRequest;
    const res = mockRes();

    await sendMessage(req, res, () => {});

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ enableWebSearch: true }),
      })
    );
  });

  it('passes req.body.options.enableWebSearch to ChatService.streamMessage', async () => {
    const streamSpy = jest.spyOn(ChatService, 'streamMessage').mockResolvedValueOnce({
      conversationId: 101,
      messageId: 1,
      content: 'stream done',
      sources: [],
    } as any);

    const req = {
      id: 'rid-2',
      userId: 42,
      body: {
        message: 'Search query in stream',
        provider: 'gemini',
        options: { enableWebSearch: true },
      },
      on: jest.fn(),
    } as unknown as AuthRequest;
    const res = mockRes();

    await streamMessage(req, res, () => {});

    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ enableWebSearch: true }),
      }),
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('emits token_usage SSE event before done when streamMessage returns tokenUsage', async () => {
    const fakeTokenUsage = {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      estimatedCostUsd: 0.00002,
    };
    jest.spyOn(ChatService, 'streamMessage').mockResolvedValueOnce({
      conversationId: 101,
      messageId: 1,
      content: 'stream done',
      sources: [],
      tokenUsage: fakeTokenUsage,
    } as any);

    const req = {
      id: 'rid-3',
      userId: 42,
      body: {
        message: 'Search query in stream with usage',
        provider: 'openai',
      },
      on: jest.fn(),
    } as unknown as AuthRequest;
    const res = mockRes();

    await streamMessage(req, res, () => {});

    expect(res.write).toHaveBeenCalledWith(
      `event: token_usage\ndata: ${JSON.stringify(fakeTokenUsage)}\n\n`
    );
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"done"')
    );
    expect(res.end).toHaveBeenCalled();
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
  });

  it('emits token_usage after tool events and does not emit it twice', async () => {
    const fakeTokenUsage = {
      promptTokens: 3,
      completionTokens: 1,
      totalTokens: 4,
    };
    jest.spyOn(ChatService, 'streamMessage').mockImplementationOnce(async (input) => {
      input.res?.write('event: tool_call\ndata: {"name":"calculate"}\n\n');
      input.res?.write(`event: token_usage\ndata: ${JSON.stringify(fakeTokenUsage)}\n\n`);
      return {
        conversationId: 101,
        messageId: 1,
        content: '4',
        sources: [],
        tokenUsage: fakeTokenUsage,
      } as any;
    });

    const req = {
      id: 'rid-4',
      userId: 42,
      body: { message: 'порахуй', provider: 'openai' },
      on: jest.fn(),
    } as unknown as AuthRequest;
    const res = mockRes();

    await streamMessage(req, res, () => {});

    const usageFrames = (res.write as jest.Mock).mock.calls.filter((call) =>
      String(call[0]).startsWith('event: token_usage\n')
    );
    expect(usageFrames).toHaveLength(1);
  });
});
