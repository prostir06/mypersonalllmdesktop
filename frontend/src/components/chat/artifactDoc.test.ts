import { describe, it, expect } from 'vitest';
import { artifactGuardPrefix, injectArtifactGuard } from './artifactGuard';

describe('artifactGuardPrefix', () => {
  it('ships a CSP meta and blocks non-anchor navigations in the prefix', () => {
    const html = artifactGuardPrefix();
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("form-action 'none'");
    expect(html).toContain('ARTIFACT_NAV_BLOCKED');
  });

  it('injects the guard into an existing head', () => {
    const html = injectArtifactGuard('<html><head><title>x</title></head><body></body></html>');
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<title>'));
  });
});
