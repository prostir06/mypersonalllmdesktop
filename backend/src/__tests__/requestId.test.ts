import express from 'express';
import type { Request } from 'express';

const request = require('supertest');
import requestId from '../middleware/requestId';
import errorHandler from '../middleware/errorHandler';
import type { RequestWithId } from '../types/express';

describe('requestId middleware', () => {
  it('generates X-Request-Id when client omits header', async () => {
    const app = express();
    app.use(requestId);
    app.get('/ping', (req: Request, res) => {
      res.json({ id: (req as RequestWithId).id });
    });

    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.body.id).toBe(res.headers['x-request-id']);
  });

  it('honors incoming X-Request-Id', async () => {
    const app = express();
    app.use(requestId);
    app.get('/ping', (req: Request, res) => {
      res.json({ id: (req as RequestWithId).id });
    });

    const res = await request(app)
      .get('/ping')
      .set('X-Request-Id', 'client-trace-1');
    expect(res.headers['x-request-id']).toBe('client-trace-1');
    expect(res.body.id).toBe('client-trace-1');
  });

  it('errorHandler includes requestId', async () => {
    const app = express();
    app.use(requestId);
    app.get('/boom', () => {
      const err = new Error('boom') as Error & { statusCode?: number };
      err.statusCode = 500;
      throw err;
    });
    app.use(errorHandler);

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('errorHandler includes requestId when an async handler throws', async () => {
    const app = express();
    app.use(requestId);
    app.get('/boom-async', async () => {
      const err = new Error('boom') as Error & { statusCode?: number };
      err.statusCode = 500;
      throw err;
    });
    app.use(errorHandler);

    const res = await request(app).get('/boom-async');
    expect(res.status).toBe(500);
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.error).toBeTruthy();
  });
});