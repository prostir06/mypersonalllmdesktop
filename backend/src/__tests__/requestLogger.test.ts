const request = require('supertest');
import express from 'express';
import logger from '../logger';
import requestId from '../middleware/requestId';
import requestLogger from '../middleware/requestLogger';
import { requestContext } from '../requestContext';

jest.mock('../logger', () => {
  const info = jest.fn();
  return {
    __esModule: true,
    default: {
      info,
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn(() => ({ info })),
    },
  };
});

const child = logger.child as jest.Mock;
const info = child().info as jest.Mock;

describe('requestLogger', () => {
  beforeEach(() => {
    child.mockClear();
    info.mockClear();
  });

  it('stores the request id and logs status with duration', async () => {
    const app = express();
    let seen: string | undefined;
    app.use(requestId);
    app.use(requestLogger);
    app.get('/ping', (_req, res) => {
      seen = requestContext.getStore()?.requestId;
      res.status(201).end();
    });

    const res = await request(app).get('/ping?x=1');

    expect(res.status).toBe(201);
    expect(seen).toBe(res.headers['x-request-id']);
    expect(child).toHaveBeenCalledWith({ requestId: seen });
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^GET \/ping 201 \d+ms$/));
  });
});
