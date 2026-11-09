import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { batch, observed, progressKey, outboxPrefix, modeKey, soundKey } from '../helpers/oracles.mjs';
import { clearBoard, freeze, holdProgressLock, match, pairButtons, readProgress, seedStorage,
  stageKeys, startPrime, visiblePairs } from '../helpers/browser.mjs';

const weak = page => page.getByRole('button', { name: 'Practice weak facts' });
const matchKey = ({ expression }) => 'match:' + expression.match(/\d+/g).map(Number).sort((a, b) => a - b).join('×');
const getBatches = page => page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix))
  .map(key => JSON.parse(localStorage.getItem(key))), outboxPrefix);
const stage = (page, changes) => page.evaluate(({ key, changes }) =>
  localStorage.setItem(key, JSON.stringify({ changes, completedRun: null })),
{ key: outboxPrefix + 'f'.repeat(32), changes });

async function miss(page, first, other) {
  await pairButtons(page, first)[0].click();
  await pairButtons(page, other)[1].click();
}

test('L04 completed Fog retry becomes a weak fact, Slow is seen, unfinished rounds write nothing', async ({ page, context }) => {
  await freeze(page);
  await page.goto('fog-sweep-64.html');
  const prime = await context.newPage();
  await prime.goto('prime-factor-64.html');
  await expect(weak(prime)).toBeDisabled();
  const [retry, slow, wrong] = await visiblePairs(page);
  await miss(page, retry, wrong);
  const [first, second] = pairButtons(page, slow);
  await first.evaluate(button => button.click());
  await page.clock.runFor(5000);
  await second.evaluate(button => button.click());
  expect(await readProgress(prime), 'an unfinished Fog round writes nothing').toBeNull();
  await clearBoard(page, { fog: true });
  await expect(weak(prime)).toBeEnabled();
  const completed = await readProgress(prime);
  expect(Object.keys(completed.facts)).toHaveLength(16);
  expect(completed.facts[matchKey(retry)].missed).toBeGreaterThan(0);
  expect(completed.facts[matchKey(slow)].missed, 'Slow first try is not a miss').toBe(0);
  expect(completed.facts[matchKey(slow)].seen).toBeGreaterThan(0);
  expect(completed.best).toEqual({});
  await prime.getByRole('button', { name: 'Practice weak facts' }).click();
  await expect(prime.locator('#recall-title')).toHaveText(retry.expression.split(' × ').sort((a, b) => Number(a) - Number(b)).join(' × ') + ' = ?');
  await page.getByRole('button', { name: 'Next round' }).click();
  const [one, other] = await visiblePairs(page);
  await miss(page, one, other);
  await page.getByRole('link', { name: 'Project home' }).click();
  expect(await readProgress(prime)).toEqual(completed);
});

test('P04 two native-lock writers stage independently and update a live Prime Factor tab', async ({ page, context }) => {
  const fog = await context.newPage();
  const observer = await context.newPage();
  await startPrime(page);
  await fog.goto('fog-sweep-64.html');
  await observer.goto('prime-factor-64.html');
  await expect(weak(observer)).toBeDisabled();
  const release = await holdProgressLock(observer);
  try {
    const [first, other] = await visiblePairs(page);
    await miss(page, first, other);
    await page.getByRole('button', { name: 'End game' }).click();
    await clearBoard(fog, { fog: true });
    expect(await readProgress(observer), 'main snapshot stays untouched while native lock is held').toBeNull();
    const queued = await getBatches(observer);
    expect(queued, 'each writer stages its own key before lock release').toHaveLength(2);
    expect(queued.map(entry => Object.keys(entry.changes.facts).length).sort((a, b) => a - b)).toEqual([1, 16]);
    expect(await stageKeys(observer)).toHaveLength(2);
    await release();
    await expect(weak(observer)).toBeEnabled();
    const merged = await readProgress(observer);
    const union = new Set(queued.flatMap(entry => Object.keys(entry.changes.facts)));
    expect(Object.keys(merged.facts).sort()).toEqual([...union].sort());
    expect(merged.facts[matchKey(first)].missed).toBeGreaterThan(0);
    await expect.poll(() => stageKeys(observer)).toEqual([]);
  } finally {
    await release();
  }
});

for (const game of ['fog', 'classic']) {
  test('P05 ' + game + ' staged save survives navigation while the native lock is held', async ({ page, context }) => {
    const holder = await context.newPage();
    await holder.goto('index.html');
    if (game === 'fog') await page.goto('fog-sweep-64.html');
    else await startPrime(page, { size: 16 });
    const [first, other] = await visiblePairs(page);
    await miss(page, first, other);
    const release = await holdProgressLock(holder);
    try {
      await clearBoard(page, { fog: game === 'fog' });
      const queued = await getBatches(holder);
      expect(queued, 'save is staged before navigation and lock release').toHaveLength(1);
      expect(await readProgress(holder), 'pending save has not changed the main snapshot').toBeNull();
      await page.getByRole('link', { name: 'Project home' }).click();
      await expect(page).toHaveURL(/index\.html$/);
      await page.getByRole('link', { name: 'Play Prime Factor 64' }).click();
      await release();
      await expect(weak(page)).toBeEnabled();
      const persisted = await readProgress(page);
      expect(persisted.facts[matchKey(first)].missed).toBeGreaterThan(0);
      expect(Object.keys(persisted.facts)).toHaveLength(16);
      expect(persisted.runIds).toEqual(game === 'classic' ? [queued[0].completedRun.id] : []);
      if (game === 'classic') expect(persisted.best['16:16:0'].firstTry).toBe(15);
      expect(await stageKeys(page)).toEqual([]);
    } finally {
      await release();
    }
  });
}

test('P07 corrupt persisted progress is backed up and announced on recovery', async ({ page }) => {
  await seedStorage(page, { [progressKey]: '{broken' });
  await page.goto('prime-factor-64.html');
  await expect(page.locator('#progress-recovery')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key + ':corrupt-backup'), progressKey)).toBe('{broken');
  expect(await readProgress(page)).toBeNull();
});

async function downloadAfter(page, action) {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

async function importText(page, text) {
  await page.locator('#progress-file').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text),
  });
}

test('P01 P08 export flushes, import merges, and reset clears captured staged items', async ({ page, context }) => {
  const initial = batch({ 'factors:144': observed(3000, false) });
  await seedStorage(page, {
    [progressKey]: JSON.stringify(initial), [modeKey]: 'easy', [soundKey]: 'off',
  });
  await page.goto('prime-factor-64.html');
  const other = await context.newPage();
  await other.goto('prime-factor-64.html');
  await expect(weak(other)).toBeEnabled();
  await page.locator('#manage-progress summary').click();

  const releaseExport = await holdProgressLock(other);
  let exported;
  try {
    await stage(other, batch({ 'factors:108': observed(3100, false) }));
    const pending = downloadAfter(page, () => page.locator('#export-progress').click());
    await expect.poll(() => other.evaluate(async key =>
      (await navigator.locks.query()).pending.some(lock => lock.name === key), progressKey)).toBe(true);
    await releaseExport();
    exported = await pending;
    expect(Object.keys(exported.facts).sort()).toEqual(['factors:108', 'factors:144']);
  } finally {
    await releaseExport();
  }
  await importText(page, JSON.stringify(batch({ 'factors:144': observed(1000, true) })));
  await expect(page.locator('#practice-status')).toHaveText('Progress merged.');
  expect(await readProgress(page)).toEqual(exported);
  for (const invalid of ['{broken', 'x'.repeat(5_000_001)]) {
    await importText(page, invalid);
    await expect(page.locator('#practice-status')).toHaveText('Choose a valid Prime Factor 64 progress file.');
    expect(await readProgress(page)).toEqual(exported);
  }
  await page.locator('#reset-progress').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await downloadAfter(page, () => page.locator('#export-before-reset').click())).toEqual(exported);
  await page.locator('#cancel-reset').click();
  expect(await readProgress(page)).toEqual(exported);

  const releaseReset = await holdProgressLock(other);
  try {
    await page.locator('#reset-progress').click();
    await page.locator('#confirm-reset').click();
    await expect.poll(() => other.evaluate(async key =>
      (await navigator.locks.query()).pending.filter(lock => lock.name === key).length, progressKey)).toBe(1);
    await stage(other, batch({ 'factors:112': observed(3500, false) }));
    expect(await stageKeys(other)).toHaveLength(1);
    await releaseReset();
    await expect(page.locator('#practice-status')).toHaveText('Progress reset.');
    await expect(weak(other)).toBeDisabled();
    await page.reload();
    expect(await readProgress(page), 'reset removes captured batches and they cannot resurrect progress').toBeNull();
    expect(await stageKeys(page)).toEqual([]);
    expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [modeKey, soundKey])).toEqual(['easy', 'off']);
  } finally {
    await releaseReset();
  }
});

test('G04 P09 browser can play and export in-tab progress with storage writes denied', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Denied', 'SecurityError'); };
  });
  await startPrime(page);
  const [pair, wrong] = await visiblePairs(page);
  await miss(page, pair, wrong);
  await page.getByRole('button', { name: 'End game' }).click();
  await page.locator('#home').click();
  await expect(page.locator('#practice-summary')).toContainText('Progress is in this tab.');
  await expect(weak(page)).toBeEnabled();
  await page.locator('#manage-progress summary').click();
  const saved = await downloadAfter(page, () => page.locator('#export-progress').click());
  expect(saved.facts[matchKey(pair)].missed).toBeGreaterThan(0);
  await page.selectOption('#start-mode', 'easy');
  await expect(page.locator('#start-mode')).toHaveValue('easy');
  await page.getByRole('button', { name: 'Start game' }).click();
  await match(page, (await visiblePairs(page))[0]);
  await expect(page.locator('#progress')).toHaveText('1/16 matched');
});

test('P04 native-lock overlapping saves retain the latest miss and qualifying local days', async ({ page, context }) => {
  const other = await context.newPage();
  await page.goto('prime-factor-64.html');
  await other.goto('prime-factor-64.html');
  const release = await holdProgressLock(page);
  try {
    const dates = [5, 6, 7, 8].map(day => Date.parse(`2026-11-0${day}T12:00:00-05:00`));
    const id = 'factors:144';
    const batches = [
      batch({ [id]: { seen: dates[2], missed: dates[0], correct: [dates[1], dates[2]] } }),
      batch({ [id]: { seen: dates[3], missed: dates[1], correct: [dates[3]] } }),
    ];
    for (const [index, tab] of [page, other].entries()) {
      await tab.evaluate(changes => {
        const store = window.PracticeProgress.createStore(window.buildDeck(), { onChange() {} });
        void store.save(changes);
      }, batches[index]);
    }
    expect(await stageKeys(page)).toHaveLength(2);
    await release();
    await expect.poll(async () => (await readProgress(other))?.facts[id]).toEqual({
      seen: dates[3], missed: dates[1], correct: [dates[2], dates[3]],
    });
    await expect(weak(other)).toBeDisabled();
  } finally {
    await release();
  }
});

test('P06 actual browser write failure preserves a completed game for recovery on refresh', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (window.failTestMainWrite && key === 'prime-factor-64:practice-progress') throw new Error('main write denied');
      return set.call(this, key, value);
    };
  });
  await startPrime(page, { size: 16 });
  await page.evaluate(() => { window.failTestMainWrite = true; });
  const [first, other] = await visiblePairs(page);
  await miss(page, first, other);
  await clearBoard(page);
  expect(await stageKeys(page)).toHaveLength(1);
  expect(await readProgress(page)).toBeNull();
  await page.goto('prime-factor-64.html');
  await expect(weak(page)).toBeEnabled();
  const recovered = await readProgress(page);
  expect(recovered.runIds).toHaveLength(1);
  expect(recovered.facts[matchKey(first)].missed).toBeGreaterThan(0);
  expect(await stageKeys(page)).toEqual([]);
});
