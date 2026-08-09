const { jsonError } = require('../utils/httpJson');

describe('jsonError', () => {
  it('includes requestId from req.id', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const req = { id: 'req-abc' };

    jsonError(res, req, 400, 'bad');

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: 'bad',
      requestId: 'req-abc',
    });
  });
});
