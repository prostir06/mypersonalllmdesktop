import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARTIFACT_SANDBOX_CSP,
  isAllowedAppOrigin,
  isSafeExternalUrl,
  UI_CSP,
} from './security';

describe('isAllowedAppOrigin', () => {
  const allowed = ['http://127.0.0.1:4173', 'http://localhost:3000'];

  it('allows listed origins', () => {
    assert.equal(isAllowedAppOrigin('http://127.0.0.1:4173/', allowed), true);
    assert.equal(isAllowedAppOrigin('http://localhost:3000/chat', allowed), true);
  });

  it('denies external and malformed', () => {
    assert.equal(isAllowedAppOrigin('https://evil.example/', allowed), false);
    assert.equal(isAllowedAppOrigin('not-a-url', allowed), false);
  });
});

describe('UI_CSP and ARTIFACT_SANDBOX_CSP', () => {
  it('restricts default-src to self and allows gravatar images', () => {
    assert.match(UI_CSP, /default-src 'self'/);
    assert.match(UI_CSP, /script-src 'self'/);
    assert.match(UI_CSP, /https:\/\/www\.gravatar\.com/);
    assert.match(UI_CSP, /frame-ancestors 'none'/);
  });

  it('isolates artifact sandbox with connect-src none and frame-ancestors self', () => {
    assert.match(ARTIFACT_SANDBOX_CSP, /default-src 'none'/);
    assert.match(ARTIFACT_SANDBOX_CSP, /connect-src 'none'/);
    assert.match(ARTIFACT_SANDBOX_CSP, /frame-ancestors 'self'/);
  });
});

describe('isSafeExternalUrl', () => {
  it('allows http(s) and mailto', () => {
    assert.equal(isSafeExternalUrl('https://example.com/docs'), true);
    assert.equal(isSafeExternalUrl('http://127.0.0.1:5000/api/health'), true);
    assert.equal(isSafeExternalUrl('mailto:support@example.com'), true);
  });

  it('rejects javascript and malformed URLs', () => {
    assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
    assert.equal(isSafeExternalUrl('file:///etc/passwd'), false);
    assert.equal(isSafeExternalUrl('not-a-url'), false);
  });
});
