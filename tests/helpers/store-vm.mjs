import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { deck } from './oracles.mjs';

const source = readFileSync(new URL('../../practice-progress.js', import.meta.url), 'utf8');

export function storeHarness({ initial = {}, locks, values = Object.assign(Object.create(null), initial) } = {}) {
  const hooks = {};
  const localStorage = new Proxy({
    getItem(key) {
      hooks.read?.(key);
      return values[key] ?? null;
    },
    setItem(key, value) {
      hooks.write?.(key, String(value));
      values[key] = String(value);
    },
    removeItem(key) {
      hooks.remove?.(key);
      delete values[key];
    },
  }, {
    ownKeys: () => Object.keys(values),
    getOwnPropertyDescriptor: (_, key) =>
      Object.hasOwn(values, key) ? { configurable: true, enumerable: true } : undefined,
  });
  const window = { addEventListener() {} };
  runInNewContext(source, { window, localStorage, navigator: { locks }, crypto: webcrypto },
    { filename: 'practice-progress.js' });
  const api = window.PracticeProgress;
  const events = [];
  const store = api.createStore(deck, {
    onChange: () => events.push('change'),
    onRecovery: () => events.push('recovery'),
  });
  return { values, hooks, api, store, events };
}

export const plain = value => JSON.parse(JSON.stringify(value));
