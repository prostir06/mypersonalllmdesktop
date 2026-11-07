#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(
  readFileSync(join(root, 'scripts/any-baseline.json'), 'utf8')
);

export const RULE = '@typescript-eslint/no-explicit-any';

export function resolveEslintBin(project) {
  const localBin = join(root, project, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (existsSync(localBin)) return localBin;
  const rootBin = join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (existsSync(rootBin)) return rootBin;
  throw new Error(`ESLint binary not found for ${project} at ${localBin}`);
}

export function parseEslintJsonOutput(stdout, status, error, stderr = '', project = '') {
  const prefix = project ? `[${project}] ` : '';
  if (error) {
    throw new Error(`${prefix}Failed to spawn ESLint: ${error.message}`);
  }
  if (status !== 0 && status !== 1) {
    throw new Error(
      `${prefix}ESLint exited with status ${status}:\n${stderr || stdout || '(no output)'}`
    );
  }
  const raw = (stdout || '').trim();
  if (!raw) {
    throw new Error(
      `${prefix}ESLint produced empty JSON output:\n${stderr || '(no stderr)'}`
    );
  }

  const files = JSON.parse(raw);
  let count = 0;
  for (const file of files) {
    for (const msg of file.messages || []) {
      if (msg.ruleId === RULE) count += 1;
    }
  }
  return count;
}

export function countAny(project) {
  const cwd = join(root, project);
  const eslintBin = resolveEslintBin(project);
  const result = spawnSync(
    process.execPath,
    [eslintBin, '.', '-f', 'json'],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }
  );

  return parseEslintJsonOutput(
    result.stdout,
    result.status,
    result.error,
    result.stderr,
    project
  );
}

export function runCli(argv = process.argv.slice(2)) {
  const target = argv[0];
  const projects = target ? [target] : ['backend', 'frontend'];
  let failed = false;

  for (const project of projects) {
    if (project !== 'backend' && project !== 'frontend') {
      console.error(`Unknown project: ${project}. Expected 'backend' or 'frontend'.`);
      process.exit(2);
    }
    try {
      const actual = countAny(project);
      const limit = baseline[project];
      const status = actual <= limit ? 'OK' : 'FAIL';
      console.log(`${status} ${project}: ${actual} explicit any (baseline <= ${limit})`);
      if (actual > limit) failed = true;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      failed = true;
    }
  }

  if (failed) {
    console.error('\nExplicit `any` count exceeded baseline or ESLint failed.');
    process.exit(1);
  }
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectRun) {
  runCli();
}
