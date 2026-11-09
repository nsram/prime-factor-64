import { test, expect } from '@playwright/test';
import { batch, deck, observed, progressKey, modeKey } from '../helpers/oracles.mjs';
import { clearBoard, equationResult, readProgress, seedStorage, stageKeys, startPrime, submitRecall,
  visiblePairs, pairButtons } from '../helpers/browser.mjs';

const stamp = day => Date.parse(`2026-11-${String(day).padStart(2, '0')}T12:00:00-05:00`);
const weakButton = page => page.getByRole('button', { name: 'Practice weak facts' });
const promptProduct = title => title.endsWith('? × ?') ? Number(title.split(' = ')[0]) : equationResult(title);
const findPrompt = page => page.locator('#recall-title').textContent();
const factsSeed = (page, facts, best = {}) => seedStorage(page, { [progressKey]: JSON.stringify(batch(facts, best)) });

test('A06 L01 reverse recall accepts all eligible orientations and rejects an outside factorization', async ({ page }) => {
  for (const result of [108, 112, 126, 144]) {
    for (const pair of deck.get(result)) {
      for (const answer of [pair, pair.toReversed()]) {
        // Create the miss through the supported import path so each drill has one reverse target.
        await page.goto('prime-factor-64.html');
        await page.locator('#progress-file').setInputFiles({
          name: 'reverse.json', mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(batch({ ['factors:' + result]: observed(Date.now() - 50, false) }))),
        });
        await expect(page.locator('#practice-status')).toHaveText('Progress merged.');
        await weakButton(page).click();
        await expect(page.locator('#recall-title')).toHaveText(result + ' = ? × ?');
        await page.getByRole('button', { name: 'Check answer' }).click();
        await expect(page.locator('#recall-next')).toHaveText('Check answer');
        expect(await submitRecall(page, answer, { advance: false })).toContain('Correct.');
        await page.getByRole('button', { name: 'End practice' }).click();
        await page.locator('#manage-progress summary').click();
        await page.locator('#reset-progress').click();
        await page.locator('#confirm-reset').click();
        await expect(page.locator('#practice-status')).toHaveText('Progress reset.');
      }
    }
  }
  await page.locator('#progress-file').setInputFiles({
    name: 'reverse.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(batch({ 'factors:144': observed(stamp(5), false) }))),
  });
  await weakButton(page).click();
  expect(await submitRecall(page, [12, 12], { advance: false })).toContain('Your factors give 12 × 12 = 144.');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.locator('#practice-status')).toHaveText('Practice finished. 0/1 correct.');
});

test('L02 drill caps weak products at five, deduplicates and fills with oldest seen prompts', async ({ page }) => {
  const weak = [108, 112, 126, 144, 153, 156];
  const fillers = [102, 104, 105, 114];
  const facts = Object.fromEntries(weak.map((product, index) => ['factors:' + product, observed(stamp(5) + index * 10, false)]));
  facts['product:8×18'] = observed(stamp(5) + 100, false);
  for (const [index, product] of fillers.entries()) facts['factors:' + product] = observed(stamp(4) + index, true);
  facts['factors:117'] = { seen: stamp(6), missed: stamp(4), correct: [stamp(5), stamp(6)] };
  await factsSeed(page, facts);
  await page.goto('prime-factor-64.html');
  await weakButton(page).click();
  const products = [];
  while (await page.locator('#recall').isVisible()) {
    products.push(promptProduct(await findPrompt(page)));
    await submitRecall(page, 'reveal');
  }
  expect(products, 'five distinct weak products, then three oldest seen fillers').toEqual([144, 156, 153, 126, 112, 102, 104, 105]);
});

test('L03 two unaided local days retire, while a later reveal reopens the same direction', async ({ page }) => {
  await page.clock.install({ time: new Date(stamp(7)) });
  await factsSeed(page, { 'factors:144': observed(stamp(5), false) });
  await page.goto('prime-factor-64.html');
  for (let i = 0; i < 2; i++) {
    await weakButton(page).click();
    await expect(page.locator('#recall-title')).toHaveText('144 = ? × ?');
    await submitRecall(page, [16, 9]);
  }
  await page.reload();
  await expect(weakButton(page)).toBeEnabled();
  await page.clock.setSystemTime(new Date(stamp(8)));
  await weakButton(page).click();
  await submitRecall(page, [8, 18]);
  await expect(weakButton(page)).toBeDisabled();
  const retired = await readProgress(page);
  expect(retired.facts['factors:144'].correct).toHaveLength(2);
  await page.clock.setSystemTime(new Date(stamp(9)));
  await page.locator('#progress-file').setInputFiles({
    name: 'later-miss.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(batch({ 'factors:144': observed(stamp(9), false) }))),
  });
  await weakButton(page).click();
  await submitRecall(page, 'reveal');
  await expect(page.locator('#practice-status')).toHaveText('Practice finished. No answers submitted.');
  expect((await readProgress(page)).facts['factors:144'].correct).toEqual([]);
  await expect(weakButton(page)).toBeEnabled();
});

test('L05 Easy mistakes, answers, reveals, replay and finish leave shared storage unchanged', async ({ page }) => {
  const initial = batch({ 'factors:144': observed(stamp(5), false) }, { '4:16:0': { firstTry: 14, perfectMs: null } });
  await seedStorage(page, { [progressKey]: JSON.stringify(initial) });
  await page.addInitScript(() => {
    window.testProgressWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('prime-factor-64:practice-progress')) window.testProgressWrites.push(key);
      return original.call(this, key, value);
    };
  });
  await startPrime(page, { mode: 'easy', size: 16, recall: 2 });
  await page.evaluate(() => { window.testProgressWrites.length = 0; });
  for (const replay of [true, false]) {
    const [first, other] = await visiblePairs(page, 0);
    await pairButtons(page, first, 0)[0].click();
    await pairButtons(page, other, 0)[1].click();
    await clearBoard(page, { section: 0 });
    await clearBoard(page, { section: 1 });
    await submitRecall(page, [1]);
    await submitRecall(page, 'reveal');
    if (replay) await page.getByRole('button', { name: 'Replay board' }).click();
    else await page.getByRole('button', { name: 'See results' }).click();
  }
  expect(await readProgress(page), 'Easy must not write shared progress').toEqual(initial);
  expect(await stageKeys(page)).toEqual([]);
  expect(await page.evaluate(() => window.testProgressWrites), 'Easy must not stage even transient writes').toEqual([]);
  await page.locator('#home').click();
  await expect(page.locator('#start-mode')).toHaveValue('easy');
  await expect(page.locator('#personal-best')).toBeHidden();
  await weakButton(page).click();
  await submitRecall(page, [8, 18]);
  expect((await readProgress(page)).facts['factors:144'].correct).toHaveLength(1);
  expect(await page.evaluate(key => localStorage.getItem(key), modeKey)).toBe('easy');
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'End game' }).click();
  expect((await readProgress(page)).runIds).toEqual([]);
});

test('L07 local midnight counts even when correct answers are minutes apart', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-08T04:58:00Z') });
  await factsSeed(page, { 'product:8×18': observed(stamp(6), false) });
  await page.goto('prime-factor-64.html');
  await weakButton(page).click();
  await expect(page.locator('#recall-title')).toHaveText('8 × 18 = ?');
  await submitRecall(page, [144]);
  await expect(weakButton(page)).toBeEnabled();
  await page.clock.setSystemTime(new Date('2026-11-08T05:02:00Z'));
  await weakButton(page).click();
  await submitRecall(page, [144]);
  await expect(weakButton(page)).toBeDisabled();
});
