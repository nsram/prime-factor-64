import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases } from './cases.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim();
const selected = process.argv.slice(2);
const active = selected.length ? cases.filter(entry => selected.includes(entry.id)) : cases;
if (!active.length || selected.some(id => !active.some(entry => entry.id === id))) {
  throw new Error('Pass known mutation IDs or omit arguments for the full exercise.');
}

const sourceFiles = readdirSync(root).filter(name => /\.(html|js|css|png)$/.test(name));
const changed = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...new Set(cases.map(entry => entry.file))], { cwd: root });
if (changed.status !== 0) throw new Error('Commit or restore production source changes before running mutations.');

function browserFailures(output) {
  const json = JSON.parse(output);
  const failed = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          if (result.status === 'failed') failed.push(...result.errors.map(error => error.message));
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of json.suites) visit(suite);
  return failed;
}

let detected = 0;
console.log('Mutation source commit:', sha);
for (const { id, file, edits, detector, assertion, level } of active) {
  const copy = mkdtempSync(join(tmpdir(), 'pf64-mutation-'));
  try {
    for (const name of [...sourceFiles, 'package.json', 'tests']) cpSync(join(root, name), join(copy, name), { recursive: true });
    symlinkSync(join(root, 'node_modules'), join(copy, 'node_modules'), 'junction');
    const target = join(copy, file);
    let source = readFileSync(target, 'utf8');
    for (const [from, to] of edits) {
      if (source.split(from).length !== 2) throw new Error(id + ' mutation target changed in ' + file);
      source = source.replace(from, () => to);
    }
    writeFileSync(target, source);
    const args = level === 'browser'
      ? ['node_modules/@playwright/test/cli.js', 'test', '--reporter=json', '--workers=1', '--grep', detector]
      : ['--test', '--test-reporter=spec', '--test-name-pattern=' + detector, 'tests/unit/progress.test.mjs'];
    const execution = spawnSync(process.execPath, args, {
      cwd: copy,
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PF64_TEST_PORT: process.env.PF64_MUTATION_PORT ?? '4283' },
    });
    let failure;
    if (execution.status === 1 && !execution.error) {
      if (level === 'unit' && execution.stdout.includes('AssertionError')) failure = execution.stdout;
      if (level === 'browser') {
        try {
          failure = browserFailures(execution.stdout).find(message => assertion.test(message));
        } catch {
          // A failed test process or malformed report is not a detection.
        }
      }
    }
    if (failure && assertion.test(failure)) {
      detected++;
      const evidence = failure.split('\n').find(line => assertion.test(line)).replace(/\x1b\[[0-9;]*m/g, '');
      console.log(`DETECTED ${id} ${detector}: ${evidence.trim()}`);
    } else {
      console.error(`UNCONFIRMED ${id} ${detector} (status ${execution.status})`);
      console.error((execution.stderr + '\n' + execution.stdout).slice(0, 6500));
    }
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}
console.log(`${detected}/${active.length} mutations detected by their assigned assertions.`);
if (detected !== active.length) process.exitCode = 1;
