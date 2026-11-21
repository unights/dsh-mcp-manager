#!/usr/bin/env node
/**
 * Run every check in order and report one line per check. Each file is a standalone
 * script that exits non-zero on failure, so this runner only sequences them and
 * keeps going to report all failures at once.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('./', import.meta.url);
const checks = readdirSync(dir)
  .filter((name) => name.endsWith('.mjs') && name !== 'run.mjs')
  .sort();

let failed = 0;
for (const name of checks) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(name, dir))], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed += 1;
    console.error('FAILED: ' + name);
  }
}

console.log('\n' + String(checks.length - failed) + '/' + String(checks.length) + ' checks passed');
process.exit(failed === 0 ? 0 : 1);
