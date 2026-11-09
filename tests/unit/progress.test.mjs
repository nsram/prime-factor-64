import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deck, batch, observed, progressKey, outboxPrefix } from '../helpers/oracles.mjs';
import { storeHarness, plain } from '../helpers/store-vm.mjs';

const key = 'product:6×18';
const alt = 'match:8×14';
const time = (day, hour = 12) => new Date(2026, 10, day, hour).valueOf();
const id = digit => digit.repeat(32);
const queued = (changes, completedRun = null) => JSON.stringify({ changes, completedRun });
const mode = '4:16:0';
const run = { id: id('a'), mode, best: { firstTry: 16, perfectMs: 2200 } };

test('P01 canonical prompt IDs, legacy acceptance, and malformed backup rejection', () => {
  const { api, store } = storeHarness();
  const ids = new Set();
  for (const [result, pairs] of deck) {
    for (const factors of pairs) {
      const pair = { result, factors };
      for (const method of ['matchId', 'recallId']) {
        const name = api[method](pair);
        assert.equal(name, api[method]({ result, factors: factors.toReversed() }));
        ids.add(name);
      }
      ids.add(api.recallId(pair, true));
    }
  }
  assert.equal(ids.size, 200);
  assert.deepEqual(plain(store.parse('{"version":1,"facts":{},"best":{}}')), batch());
  assert.deepEqual(plain(store.parse(JSON.stringify(batch({}, {}, [id('a'), id('a')])))).runIds, [id('a')]);
  for (const bad of [
    { ...batch(), version: 2 }, batch([], {}), batch({ 'factors:100': observed(100, false) }),
    batch({ [key]: { seen: 10, missed: 11, correct: [] } }),
    batch({ [key]: { seen: 10, missed: 5, correct: [5] } }),
    batch({ [key]: { seen: 1e20, missed: 0, correct: [] } }),
    batch({}, { [mode]: { firstTry: 17, perfectMs: null } }),
    batch({}, { [mode]: { firstTry: 15, perfectMs: 1 } }), batch({}, {}, ['bad-id']),
  ]) {
    assert.throws(() => store.parse(JSON.stringify(bad)), undefined, JSON.stringify(bad));
  }
  assert.throws(() => store.parse('{broken'));
});

test('P02 L03 merge laws, latest miss, same-day collapse, distinct days and bests', async () => {
  const changes = [
    batch({ [key]: observed(time(5), false), [alt]: observed(time(4), true) },
      { [mode]: { firstTry: 15, perfectMs: null } }, [id('a')]),
    batch({ [key]: { seen: time(6, 17), missed: 0, correct: [time(6), time(6, 17)] } },
      { [mode]: { firstTry: 16, perfectMs: 2000 } }, [id('b')]),
    batch({ [key]: { seen: time(8), missed: time(6), correct: [time(7), time(8)] } },
      { [mode]: { firstTry: 16, perfectMs: 1900 } }, [id('a'), id('c')]),
  ];
  async function merge(input) {
    const { store } = storeHarness();
    for (const entry of input) assert.equal(await store.save(entry), true);
    const state = plain(store.state);
    state.runIds.sort();
    return state;
  }
  const expected = batch({
    [key]: { seen: time(8), missed: time(6), correct: [time(7), time(8)] },
    [alt]: observed(time(4), true),
  }, { [mode]: { firstTry: 16, perfectMs: 1900 } }, ['a', 'b', 'c'].map(id));
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    assert.deepEqual(await merge(order.map(i => changes[i])), expected, order.join(','));
  }
  assert.deepEqual(await merge([await merge(changes.slice(0, 2)), changes[2]]), expected);
  assert.deepEqual(await merge([expected, expected]), expected);
  assert.deepEqual((await merge([changes[1], changes[1]])).facts[key].correct, [time(6, 17)]);
  assert.deepEqual((await merge([expected, batch({ [key]: observed(time(8), false) })])).facts[key].correct, []);
});

test('P03 duplicate completed-run ID cannot contribute twice', async () => {
  const { store, values } = storeHarness();
  await store.save(batch(), run);
  await store.save(batch(), run);
  assert.deepEqual(JSON.parse(values[progressKey]).runIds, [run.id], 'replay must not commit a duplicate run ID');
  await store.save(batch(), { id: id('b'), mode: '8:32:2', best: { firstTry: 20, perfectMs: null } });
  assert.deepEqual(plain(store.state).runIds, [id('a'), id('b')]);
  assert.deepEqual(plain(store.state).best, {
    [mode]: run.best, '8:32:2': { firstTry: 20, perfectMs: null },
  });
});

test('P06 a late outbox item survives the captured-key drain', async () => {
  const first = outboxPrefix + id('a');
  const late = outboxPrefix + id('b');
  const { store, values, hooks } = storeHarness({ initial: { [first]: queued(batch({ [key]: observed(time(5), false) })) } });
  hooks.read = name => {
    if (name === first) values[late] = queued(batch({ [alt]: observed(time(6), true) }));
  };
  await store.refresh();
  assert.ok(values[late], 'late entry survives first drain');
  assert.equal(values[first], undefined);
  assert.equal(store.state.facts[alt], undefined);
  await store.refresh();
  assert.equal(values[late], undefined);
  assert.deepEqual(plain(store.state).facts[alt], observed(time(6), true));
});

test('P06 write failure preserves outbox; cleanup failure replays the committed run', async () => {
  const { store, values, hooks } = storeHarness();
  hooks.write = name => {
    if (name === progressKey) throw new Error('simulated quota error');
  };
  assert.equal(await store.save(batch({ [key]: observed(time(5), false) }), run), false);
  const keyName = Object.keys(values).find(name => name.startsWith(outboxPrefix));
  assert.ok(keyName, 'batch remains staged on failed commit');
  assert.equal(values[progressKey], undefined);
  delete hooks.write;
  hooks.remove = name => {
    if (name === keyName) throw new Error('interrupted cleanup');
  };
  await store.refresh();
  assert.ok(values[keyName]);
  const saved = JSON.parse(values[progressKey]);
  assert.deepEqual(saved.runIds, [run.id]);
  delete hooks.remove;
  await store.refresh();
  assert.deepEqual(plain(store.state), saved);
  assert.equal(values[keyName], undefined);
});

test('P07 recover corrupt snapshot and batch without losing valid queued observations', async () => {
  const good = outboxPrefix + id('a');
  const bad = outboxPrefix + id('b');
  const { store, values, events } = storeHarness({
    initial: { [progressKey]: '{broken', [good]: queued(batch({ [key]: observed(time(5), false) })), [bad]: 'bad batch' },
  });
  await store.refresh();
  assert.equal(values[progressKey + ':corrupt-backup'], '{broken');
  assert.equal(values[progressKey + ':corrupt-backup:' + id('b')], 'bad batch');
  assert.deepEqual(events, ['recovery', 'change']);
  assert.deepEqual(plain(store.state).facts[key], observed(time(5), false));
  assert.equal(values[bad], undefined);
});

test('P09 sequential fallback with unavailable/rejected Web Locks and blocked storage recovery', async () => {
  for (const locks of [undefined, { request: async () => { throw new Error('lock denied'); } }]) {
    const { store, values, hooks } = storeHarness({ locks });
    hooks.read = hooks.write = () => { throw new Error('storage denied'); };
    assert.equal(await store.save(batch({ [key]: observed(time(5), false) })), false);
    assert.deepEqual(plain(store.state).facts[key], observed(time(5), false));
    delete hooks.read;
    delete hooks.write;
    assert.equal(await store.save(batch({ [alt]: observed(time(6), true) })), true);
    assert.deepEqual(JSON.parse(values[progressKey]).facts, {
      [key]: observed(time(5), false), [alt]: observed(time(6), true),
    });
  }
});

test('P02 seeded observation sequences match an independent per-day oracle', async () => {
  for (const seed of [1, 2026, 42, 65537]) {
    let state = seed;
    const observations = Array.from({ length: 24 }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const at = time(2 + state % 8, (state >>> 8) % 24);
      return [at, (state >>> 16) % 6 !== 0];
    });
    const lastMiss = Math.max(0, ...observations.filter(([, correct]) => !correct).map(([at]) => at));
    const dates = new Map();
    for (const [at, correct] of observations) {
      if (!correct || at <= lastMiss) continue;
      const day = new Date(at).getDate();
      dates.set(day, Math.max(at, dates.get(day) ?? 0));
    }
    const expected = {
      seen: Math.max(...observations.map(([at]) => at)),
      missed: lastMiss,
      correct: [...dates.values()].sort((a, b) => a - b).slice(-2),
    };
    const { store } = storeHarness();
    for (const [at, correct] of [...observations, ...observations.toReversed()]) {
      await store.save(batch({ [key]: observed(at, correct) }));
    }
    assert.deepEqual(plain(store.state).facts[key], expected, 'seed ' + seed);
  }
});
