import express from 'express';

const request = require('supertest');

jest.mock('../services/ChatService', () => ({
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
  getHistory: jest.fn(),
  searchMessages: jest.fn(),
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../middleware/auth', () => (req: any, _res: any, next: any) => {
  req.userId = 1;
  next();
});

import ChatService from '../services/ChatService';
import chatRouter from '../routes/chat';

const mockedChat = ChatService as any;

const app = express();
app.use(express.json());
app.use('/api/chat', chatRouter);

describe('chat routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /send 400 when message empty', async () => {
    const res = await request(app).post('/api/chat/send').send({ message: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Message is required');
  });

  it('POST /send 400 when message > 4000', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .send({ message: 'x'.repeat(4001) });
    expect(res.status).toBe(400);
  });

  it('POST /send maps ChatError 403', async () => {
    const err: any = new Error('Forbidden');
    err.statusCode = 403;
    mockedChat.sendMessage.mockRejectedValue(err);
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: 9, message: 'hi' });
    expect(res.status).toBe(403);
  });

  it('POST /send success', async () => {
    mockedChat.sendMessage.mockResolvedValue({
      conversationId: 1,
      messageId: 2,
      content: 'ok',
      role: 'assistant',
      timestamp: new Date(),
      usage: {},
    });
    const res = await request(app).post('/api/chat/send').send({ message: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      conversationId: 1,
      messageId: 2,
      content: 'ok',
    });
  });

  it('POST /send forces enableTools false even if client requests tools', async () => {
    mockedChat.sendMessage.mockResolvedValue({
      conversationId: 1,
      messageId: 2,
      content: 'ok',
      role: 'assistant',
      timestamp: new Date(),
      usage: {},
    });
    const res = await request(app)
      .post('/api/chat/send')
      .send({
        message: 'hi',
        options: { enableTools: true, temperature: 0.2 },
      });
    expect(res.status).toBe(200);
    expect(mockedChat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          enableTools: false,
          temperature: 0.2,
        }),
      })
    );
  });

  it('GET /history/:id 404', async () => {
    const err: any = new Error('Conversation not found');
    err.statusCode = 404;
    mockedChat.getHistory.mockRejectedValue(err);
    const res = await request(app).get('/api/chat/history/5');
    expect(res.status).toBe(404);
  });

  it('GET /search short q → 400 Ukrainian', async () => {
    const res = await request(app).get('/api/chat/search').query({ q: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Пошуковий запит має бути не менше 2 символів');
  });

  it('GET /search success', async () => {
    mockedChat.searchMessages.mockResolvedValue({ results: [], total: 0 });
    const res = await request(app).get('/api/chat/search').query({ q: 'ab' });
    expect(res.status).toBe(200);
    expect(mockedChat.searchMessages).toHaveBeenCalledWith(1, 'ab', undefined);
  });

  it('POST /stream writes init then tokens', async () => {
    mockedChat.streamMessage.mockImplementation(
      async (
        _input: unknown,
        onToken: (t: string) => void,
        onInit?: (id: number) => void
      ) => {
        if (onInit) onInit(3);
        onToken('x');
        return { conversationId: 3, messageId: 9, content: 'x' };
      }
    );

    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'hi', conversationId: 3 });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('"type":"init"');
    expect(res.text).toContain('"type":"token"');
    expect(res.text).toContain('"type":"done"');
    const input = mockedChat.streamMessage.mock.calls[0][0];
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('POST /stream returns 403 JSON before SSE headers', async () => {
    const err: any = new Error('Forbidden');
    err.statusCode = 403;
    mockedChat.streamMessage.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'hi', conversationId: 9 });

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).not.toMatch(/text\/event-stream/);
    expect(res.body.error).toBe('Forbidden');
  });

  it('POST /stream emits SSE error after init', async () => {
    mockedChat.streamMessage.mockImplementation(
      async (
        _input: unknown,
        _onToken: (t: string) => void,
        onInit?: (id: number) => void
      ) => {
        if (onInit) onInit(3);
        throw new Error('provider boom');
      }
    );

    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'hi', conversationId: 3 });

    expect(res.status).toBe(200);
    expect(res.text).toContain('"type":"init"');
    expect(res.text).toContain('"type":"error"');
    expect(res.text).toContain('provider boom');
  });

  it('POST /send returns 500 on unexpected errors', async () => {
    mockedChat.sendMessage.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/api/chat/send').send({ message: 'hi' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to send message');
  });

  it('POST /send omits details in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      mockedChat.sendMessage.mockRejectedValue(new Error('secret internals'));
      const res = await request(app).post('/api/chat/send').send({ message: 'hi' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to send message');
      expect(res.body.details).toBeUndefined();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('POST /send includes details outside production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      mockedChat.sendMessage.mockRejectedValue(new Error('secret internals'));
      const res = await request(app).post('/api/chat/send').send({ message: 'hi' });
      expect(res.status).toBe(500);
      expect(res.body.details).toBe('secret internals');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('POST /stream omits raw error text in production after SSE start', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      mockedChat.streamMessage.mockImplementation(
        async (
          _input: unknown,
          _onToken: (t: string) => void,
          onInit?: (id: number) => void
        ) => {
          if (onInit) onInit(3);
          throw new Error('provider secret');
        }
      );

      const res = await request(app)
        .post('/api/chat/stream')
        .send({ message: 'hi', conversationId: 3 });

      expect(res.status).toBe(200);
      expect(res.text).toContain('"type":"error"');
      expect(res.text).not.toContain('provider secret');
      expect(res.text).toContain('Stream failed');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('GET /history omits details in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      mockedChat.getHistory.mockRejectedValue(new Error('db path leak'));
      const res = await request(app).get('/api/chat/history/1');
      expect(res.status).toBe(500);
      expect(res.body.details).toBeUndefined();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('GET /search returns 500 on service failure', async () => {
    mockedChat.searchMessages.mockRejectedValue(new Error('db'));
    const res = await request(app).get('/api/chat/search').query({ q: 'ab' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Помилка пошуку');
  });

  it('GET /search maps ChatError 400 for invalid conversationId', async () => {
    const err: any = new Error('Invalid conversationId');
    err.statusCode = 400;
    mockedChat.searchMessages.mockRejectedValue(err);
    const res = await request(app)
      .get('/api/chat/search')
      .query({ q: 'ab', conversationId: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid conversationId');
  });

  it('POST /stream 400 when message empty', async () => {
    const res = await request(app).post('/api/chat/stream').send({ message: '  ' });
    expect(res.status).toBe(400);
    expect(mockedChat.streamMessage).not.toHaveBeenCalled();
  });

  it('GET /history returns 500 on unexpected errors', async () => {
    mockedChat.getHistory.mockRejectedValue(new Error('db'));
    const res = await request(app).get('/api/chat/history/1');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch conversation history');
  });
});
