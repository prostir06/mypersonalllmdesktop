import errorHandler from '../middleware/errorHandler';

function run(err: Error & { code?: string; name?: string }) {
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) } as any;
  errorHandler(err, { url: '/x', method: 'POST' } as any, res, jest.fn());
  return { status: res.status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

it('maps LIMIT_FILE_SIZE to 413', () => {
  const err = Object.assign(new Error('File too large'), {
    name: 'MulterError',
    code: 'LIMIT_FILE_SIZE',
  });
  expect(run(err).status).toBe(413);
});

it('maps other MulterError to 400', () => {
  const err = Object.assign(new Error('Too many files'), {
    name: 'MulterError',
    code: 'LIMIT_FILE_COUNT',
  });
  expect(run(err).status).toBe(400);
});
