import http from 'http';
import { bindClientAbortSignal } from '../utils/requestAbort';

it('aborts when the client socket closes before the response ends', async () => {
  let signal: AbortSignal | undefined;
  let markSeen: () => void = () => undefined;
  const seen = new Promise<void>((resolve) => {
    markSeen = resolve;
  });
  const server = http.createServer((req, res) => {
    signal = bindClientAbortSignal(req, res);
    markSeen();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const client = http.request({ host: '127.0.0.1', port, method: 'POST' });
  client.on('error', () => undefined);
  client.end('{}');
  await seen;
  client.destroy();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(signal?.aborted).toBe(true);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
