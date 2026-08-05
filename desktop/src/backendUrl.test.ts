import assert from 'assert';
import { describe, it, afterEach } from 'node:test';
import { resolveBackendOrigin } from './backendUrl';

describe('resolveBackendOrigin', () => {
  const prevBackend = process.env.BACKEND_URL;
  const prevLlm = process.env.LLM_BACKEND_URL;
  const prevAllow = process.env.ELECTRON_BACKEND_ALLOWLIST;

  afterEach(() => {
    if (prevBackend === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = prevBackend;
    if (prevLlm === undefined) delete process.env.LLM_BACKEND_URL;
    else process.env.LLM_BACKEND_URL = prevLlm;
    if (prevAllow === undefined) delete process.env.ELECTRON_BACKEND_ALLOWLIST;
    else process.env.ELECTRON_BACKEND_ALLOWLIST = prevAllow;
  });

  it('defaults to loopback :5000', () => {
    delete process.env.BACKEND_URL;
    delete process.env.LLM_BACKEND_URL;
    assert.strictEqual(resolveBackendOrigin(), 'http://127.0.0.1:5000');
  });

  it('accepts localhost and strips path', () => {
    assert.strictEqual(
      resolveBackendOrigin('http://localhost:5000/api'),
      'http://localhost:5000'
    );
  });

  it('rejects non-allowlisted hosts', () => {
    assert.throws(() => resolveBackendOrigin('http://evil.example:5000'), /not allowed/);
  });

  it('allows ELECTRON_BACKEND_ALLOWLIST hosts', () => {
    process.env.ELECTRON_BACKEND_ALLOWLIST = 'api.lan';
    assert.strictEqual(
      resolveBackendOrigin('http://api.lan:5000'),
      'http://api.lan:5000'
    );
  });
});
