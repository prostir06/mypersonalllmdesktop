import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAllowedAppOrigin, UI_CSP } from './security';

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

describe('UI_CSP', () => {
  it('restricts default-src to self and allows gravatar images', () => {
    assert.match(UI_CSP, /default-src 'self'/);
    assert.match(UI_CSP, /https:\/\/www\.gravatar\.com/);
    assert.match(UI_CSP, /frame-ancestors 'none'/);
  });
});
