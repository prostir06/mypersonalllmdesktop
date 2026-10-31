import express from 'express';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../services/ChatService', () => ({
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
  getHistory: jest.fn(),
  searchMessages: jest.fn(),
}));

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    llmModel: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
  prisma: {
    llmModel: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

import ChatService from '../services/ChatService';
import prisma from '../config/prisma';
import chatRouter from '../routes/chat';
import modelsRouter from '../routes/models';

const mockedChat = ChatService as unknown as {
  sendMessage: jest.Mock;
  streamMessage: jest.Mock;
};

const mockedPrisma = prisma as unknown as {
  llmModel: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
};

const app = express();
app.use(express.json());
app.use('/api/chat', chatRouter);
app.use('/api/models', modelsRouter);

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Multi-provider route validation (openai, ollama, gemini, anthropic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['gemini', 'anthropic'])(
    'POST /api/chat/send accepts %s provider',
    async (provider) => {
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
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({ message: 'Привіт', provider, model: 'test-model' });

      expect(res.status).toBe(200);
      expect(mockedChat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ provider, model: 'test-model' })
      );
    }
  );

  it.each(['gemini', 'anthropic'])(
    'POST /api/chat/stream accepts %s provider',
    async (provider) => {
      mockedChat.streamMessage.mockImplementation(
        async (
          _params: unknown,
          onToken: (token: string) => void,
          onInit: (convId: number) => void
        ) => {
          onInit(10);
          onToken('ok');
          return { messageId: 1, content: 'ok' };
        }
      );

      const res = await request(app)
        .post('/api/chat/stream')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({ message: 'Привіт', provider, model: 'test-model' });

      expect(res.status).toBe(200);
      expect(mockedChat.streamMessage).toHaveBeenCalled();
    }
  );

  it('POST /api/chat/send still rejects unknown provider with 400', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ message: 'Привіт', provider: 'unknown_vendor' });

    expect(res.status).toBe(400);
  });

  it.each(['gemini', 'anthropic'])(
    'POST /api/models and PUT /api/models/:id accept %s provider',
    async (provider) => {
      const createdRow = {
        id: 7,
        userId: 1,
        name: `Custom ${provider}`,
        modelId: `${provider}-custom`,
        description: null,
        provider,
        temperature: 0.7,
        maxTokens: 4096,
        isDefault: false,
        createdAt: new Date('2026-10-31T00:00:00Z'),
      };
      mockedPrisma.llmModel.create.mockResolvedValue(createdRow);
      mockedPrisma.llmModel.findFirst.mockResolvedValue(createdRow);
      mockedPrisma.llmModel.update.mockResolvedValue(createdRow);

      const createRes = await request(app)
        .post('/api/models')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({
          name: `Custom ${provider}`,
          modelId: `${provider}-custom`,
          provider,
          maxTokens: 4096,
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.provider).toBe(provider);

      const updateRes = await request(app)
        .put('/api/models/7')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({ name: `Updated ${provider}`, provider });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.provider).toBe(provider);
    }
  );
});
