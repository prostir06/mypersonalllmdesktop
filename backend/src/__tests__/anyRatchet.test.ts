import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('scripts/any-ratchet.mjs', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const scriptPath = path.join(repoRoot, 'scripts', 'any-ratchet.mjs');

  it('executes ESLint via node without EINVAL and reports actual explicit-any counts', () => {
    const result = spawnSync(process.execPath, [scriptPath, 'backend'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('backend:');
  });

  describe('parseEslintJsonOutput', () => {
    it('parses valid eslint json and counts explicit any occurrences', () => {
      const inlineCode = `
        import { parseEslintJsonOutput } from './scripts/any-ratchet.mjs';
        const json = JSON.stringify([
          {
            filePath: 'file1.ts',
            messages: [
              { ruleId: '@typescript-eslint/no-explicit-any', message: 'Unexpected any' },
              { ruleId: 'other-rule', message: 'Other warning' },
            ],
          },
          {
            filePath: 'file2.ts',
            messages: [
              { ruleId: '@typescript-eslint/no-explicit-any', message: 'Unexpected any' },
            ],
          },
        ]);
        const count = parseEslintJsonOutput(json, 0);
        console.log('COUNT:' + count);
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', inlineCode], {
        cwd: repoRoot,
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('COUNT:2');
    });

    it('throws when spawn error is passed', () => {
      const inlineCode = `
        import { parseEslintJsonOutput } from './scripts/any-ratchet.mjs';
        try {
          parseEslintJsonOutput('', null, new Error('spawn EINVAL'), '', 'backend');
        } catch (err) {
          console.log('CAUGHT:' + err.message);
        }
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', inlineCode], {
        cwd: repoRoot,
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('CAUGHT:[backend] Failed to spawn ESLint: spawn EINVAL');
    });

    it('throws when exit status is neither 0 nor 1', () => {
      const inlineCode = `
        import { parseEslintJsonOutput } from './scripts/any-ratchet.mjs';
        try {
          parseEslintJsonOutput('', 2, undefined, 'fatal error', 'backend');
        } catch (err) {
          console.log('CAUGHT:' + err.message);
        }
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', inlineCode], {
        cwd: repoRoot,
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('CAUGHT:[backend] ESLint exited with status 2:\nfatal error');
    });

    it('throws when stdout is empty', () => {
      const inlineCode = `
        import { parseEslintJsonOutput } from './scripts/any-ratchet.mjs';
        try {
          parseEslintJsonOutput('   ', 0, undefined, 'stderr log', 'frontend');
        } catch (err) {
          console.log('CAUGHT:' + err.message);
        }
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', inlineCode], {
        cwd: repoRoot,
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('CAUGHT:[frontend] ESLint produced empty JSON output:\nstderr log');
    });
  });
});
