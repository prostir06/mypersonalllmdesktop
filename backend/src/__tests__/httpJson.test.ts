import { jsonError } from '../utils/httpJson';
import type { Request, Response } from 'express';

describe('jsonError', () => {
  it('includes requestId from req.id', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;
    const req = { id: 'req-abc' } as Request;

    jsonError(res, req, 400, 'bad');

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: 'bad',
      requestId: 'req-abc',
    });
  });
});
