import { test } from 'node:test';
import { batch, observed, progressKey, outboxPrefix } from '../helpers/oracles.mjs';
import { storeHarness } from '../helpers/store-vm.mjs';

const optional = { skip: !process.env.PF64_DIAGNOSTICS };

test('P10 Q02 no-lock interleaving after one writer reads its old snapshot', optional, async t => {
  const a = storeHarness();
  const b = storeHarness({ values: a.values });
  let secondSave;
  a.hooks.write = name => {
    if (name === progressKey) secondSave = b.store.save(batch({ 'factors:112': observed(200, false) }));
  };
  await a.store.save(batch({ 'factors:108': observed(100, false) }));
  await secondSave;
  t.diagnostic(JSON.stringify({ stored: Object.keys(JSON.parse(a.values[progressKey]).facts) }));
});

test('P10 Q03 save staged after reset enumerates keys', optional, async t => {
  const early = outboxPrefix + 'a'.repeat(32);
  const late = outboxPrefix + 'b'.repeat(32);
  const queued = result => JSON.stringify({ changes: batch({ ['factors:' + result]: observed(100, false) }), completedRun: null });
  const { store, values, hooks } = storeHarness({ initial: { [early]: queued(108) } });
  hooks.remove = name => { if (name === early) values[late] = queued(112); };
  await store.reset();
  const survives = Object.hasOwn(values, late);
  await store.refresh();
  t.diagnostic(JSON.stringify({ survives, afterRefresh: Object.keys(store.state.facts) }));
});

test('P10 Q03 fallback memory may restore data after another tab resets', optional, async t => {
  const a = storeHarness();
  const b = storeHarness({ values: a.values });
  a.hooks.read = a.hooks.write = () => { throw new Error('storage denied'); };
  await a.store.save(batch({ 'factors:144': observed(100, false) }));
  await b.store.reset();
  delete a.hooks.read;
  delete a.hooks.write;
  await a.store.refresh();
  t.diagnostic(JSON.stringify({ afterRefresh: Object.keys(a.store.state.facts) }));
});
