import { describe, it, expect } from 'vitest';

describe('Theme Design Tokens in index.css', () => {
  it('defines dark and light theme tokens in index.css', async () => {
    const nodeFsMod = 'node:fs';
    const nodePathMod = 'node:path';
    const fs = ((await import(/* @vite-ignore */ nodeFsMod)) as any).default;
    const path = ((await import(/* @vite-ignore */ nodePathMod)) as any).default;
    const proc = (globalThis as unknown as { process: { cwd: () => string } }).process;
    const cssPath = path.resolve(proc.cwd(), 'src/index.css');
    const cssContent = String(fs.readFileSync(cssPath, 'utf-8'));

    expect(cssContent).toContain('--bg-main: #060a14;');
    expect(cssContent).toContain('--accent-cyan: #00f0ff;');
    expect(cssContent).toContain('--radius-lg: 14px;');
    expect(cssContent).toContain("[data-theme='light']");
    expect(cssContent).toContain('--bg-main: #f8f9fa;');
    expect(cssContent).toContain('--accent-primary: #0047ff;');
    expect(cssContent).not.toMatch(/\.btn\s*\{[^}]*text-transform:\s*uppercase/i);
  });
});
