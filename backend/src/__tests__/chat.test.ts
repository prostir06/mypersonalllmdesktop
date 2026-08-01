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
  });
});
