import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const dir = mkdtempSync(join(tmpdir(), 'ikataster-test-exit-'));
try {
  const script = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts.test;
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, workspaces: ['a', 'b'], scripts: { test: script } }));
  for (const [name, code] of [['a', 7], ['b', 0]]) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'package.json'), JSON.stringify({ name, scripts: { test: `node -e process.exit(${code})` } }));
  }
  const result = spawnSync('npm', ['test'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(result.status, null, 'npm must finish normally');
  assert.notEqual(result.status, 0, 'root test must fail when a workspace fails, even if the last workspace passes');
  console.log('PASS: workspace failure propagates to root');
} finally { rmSync(dir, { recursive: true, force: true }); }
