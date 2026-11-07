import express, { Request, Response } from 'express';
import { validateChatSend } from '../validators/chatValidator';

const request = require('supertest');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.post('/send', validateChatSend, (_req: Request, res: Response) => {
  res.json({ ok: true });
});

describe('validateChatSend attachments', () => {
  it('rejects a single attachment over 12000 characters', async () => {
    const res = await request(app)
      .post('/send')
      .send({
        message: 'hi',
        options: {
          attachments: [{ filename: 'a.txt', content: 'x'.repeat(12_001) }],
        },
      });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('12000');
  });

  it('accepts attachments within the cap', async () => {
    const res = await request(app)
      .post('/send')
      .send({
        message: 'hi',
        options: {
          attachments: [{ filename: 'a.txt', content: 'ok' }],
        },
      });
    expect(res.status).toBe(200);
  });
});
