import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Theme Design Tokens in index.css', () => {
  const cssPath = path.resolve(__dirname, 'index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  it('defines dark theme tokens in :root', () => {
    expect(cssContent).toContain('--bg-main: #060a14;');
    expect(cssContent).toContain('--accent-cyan: #00f0ff;');
    expect(cssContent).toContain('--radius-lg: 14px;');
  });

  it('defines light theme tokens in [data-theme=\'light\']', () => {
    expect(cssContent).toContain("[data-theme='light']");
    expect(cssContent).toContain('--bg-main: #f8f9fa;');
    expect(cssContent).toContain('--accent-primary: #0047ff;');
  });

  it('does not force global text-transform: uppercase on buttons or cards', () => {
    expect(cssContent).not.toMatch(/\.btn\s*\{[^}]*text-transform:\s*uppercase/i);
    expect(cssContent).not.toMatch(/\.conversation-card\s*\{[^}]*text-transform:\s*uppercase/i);
  });
});
