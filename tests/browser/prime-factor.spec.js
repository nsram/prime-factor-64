import { test, expect } from '@playwright/test';
import { deck, modeKey } from '../helpers/oracles.mjs';
import { boardColumns, clearBoard, equationResult, freeze, match, pairButtons,
  readProgress, seedStorage, startPrime, submitRecall, visiblePairs } from '../helpers/browser.mjs';

test('A07 G01 Classic aligns disabled matches and attributes a miss to the first card', async ({ page }) => {
  await startPrime(page);
  const [first, other] = await visiblePairs(page);
  const [expression, result] = pairButtons(page, first);
  const [otherExpression, otherResult] = pairButtons(page, other);
  await expression.click();
  await otherExpression.click();
  await expect(otherExpression).toHaveAttribute('aria-pressed', 'true');
  await otherExpression.click();
  await expect(otherExpression).toHaveAttribute('aria-pressed', 'false');
  await result.click();
  await otherExpression.click();
  await expect(page.locator('#feedback')).toHaveText('Try again.');
  await match(page, first, { reverse: true });
  await match(page, other, { input: 'keyboard' });
  await expect(expression).toBeDisabled();
  await expect(result).toBeDisabled();
  await result.evaluate(button => button.click());
  await expect(page.locator('#progress')).toHaveText('2/16 matched');
  await expect(page.locator('#expressions .matched')).toHaveText([first.expression, other.expression]);
  await expect(page.locator('#results .matched')).toHaveText([String(first.result), String(other.result)]);
  await expect(otherResult).not.toHaveClass(/wrong/);
  await page.getByRole('button', { name: 'End game' }).click();
  await expect(page.locator('#review-list')).toHaveText(first.expression + ' = ' + first.result);
  await expect(page.locator('#final-accuracy')).toHaveText('1/2');
  await expect(page.locator('#final-matches')).toHaveText('2/16');
  await expect.poll(async () => Object.keys((await readProgress(page))?.facts ?? {}).length).toBe(2);
  expect((await readProgress(page)).runIds).toEqual([]);
});

test('A06 G02 Classic offers the supported options and completes short and full runs', async ({ page }) => {
  await freeze(page);
  await page.goto('prime-factor-64.html');
  const values = selector => page.locator(selector).locator('option').evaluateAll(options => options.map(option => option.value));
  expect(await values('#start-board-size')).toEqual(['4', '8', '16']);
  expect(await values('#start-recall-count')).toEqual(['0', '2', '4']);
  for (const [size, length, recall] of [[16, 16, 0], [8, 16, 2], [16, 64, 4]]) {
    await startPrime(page, { size, length, recall });
    expect(await values('#start-board-count')).toEqual(['16', '32', '48', '64']);
    for (let board = 0; board < length / size; board++) {
      await clearBoard(page);
      if (recall) {
        await expect(page.locator('#recall-step')).toContainText('1 of ' + recall);
        for (let prompt = 0; prompt < recall; prompt++) await submitRecall(page, 'reveal');
      } else if (board + 1 < length / size) {
        await page.clock.runFor(300);
      }
    }
    await expect(page.locator('#finish-title')).toHaveText('All ' + length + ' matched.');
    await expect(page.locator('#final-accuracy')).toHaveText(length + '/' + length);
    await expect(page.locator('#final-time')).toBeVisible();
    if (recall) await expect(page.locator('#final-recall')).toHaveText('—');
  }
});

test('G03 Classic pause freezes time, preserves selection and delays board advance', async ({ page }) => {
  await freeze(page);
  await startPrime(page);
  const [pair] = await visiblePairs(page);
  const [expression, result] = pairButtons(page, pair);
  await expression.click();
  await page.clock.runFor(2000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('#board')).toBeHidden();
  await page.clock.runFor(5000);
  await expect(page.locator('#clock')).toHaveText('0:02');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(expression).toHaveAttribute('aria-pressed', 'true');
  await result.click();
  await clearBoard(page);
  await page.clock.runFor(100);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.clock.runFor(900);
  await expect(page.locator('#board-number')).toHaveText('Board 1 of 4');
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.clock.runFor(199);
  await expect(page.locator('#board-number')).toHaveText('Board 1 of 4');
  await page.clock.runFor(1);
  await expect(page.locator('#board-number')).toHaveText('Board 2 of 4');
  await clearBoard(page);
  await page.locator('#home').click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.clock.runFor(300);
  await expect(page.locator('#board-number')).toHaveText('Board 1 of 4');
  await expect(page.locator('#clock')).toHaveText('0:00');
});

test('G03 L06 Classic recall is untimed and prioritizes a miss then slower pairs', async ({ page }) => {
  await freeze(page);
  await startPrime(page, { recall: 4 });
  const [missed, slow, medium, quick] = await visiblePairs(page);
  const [first] = pairButtons(page, missed);
  await first.click();
  await pairButtons(page, quick)[1].click();
  for (const [pair, delay] of [[missed, 5], [slow, 1900], [medium, 500], [quick, 0]]) {
    const [left, right] = pairButtons(page, pair);
    await left.click();
    await page.clock.runFor(delay);
    await right.click();
  }
  await expect(page.locator('#recall-title')).toHaveText(missed.expression + ' = ?');
  await expect(page.locator('#clock')).toHaveText('0:02');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('#recall')).toBeHidden();
  await page.clock.runFor(4000);
  await page.getByRole('button', { name: 'Resume' }).click();
  await submitRecall(page, [missed.result]);
  await expect(page.locator('#recall-title')).toHaveText(slow.result + ' = ? × ?');
  await submitRecall(page, deck.get(slow.result)[0]);
  await expect(page.locator('#recall-title')).toHaveText(medium.expression + ' = ?');
  await submitRecall(page, [medium.result]);
  await expect(page.locator('#recall-title')).toHaveText(quick.result + ' = ? × ?');
  await submitRecall(page, deck.get(quick.result)[0]);
  await expect(page.locator('#clock')).toHaveText('0:02');
  await expect(page.locator('#board-number')).toHaveText('Board 2 of 4');
});

test('A06 G04 mode defaults, per-mode setup, guide preview and explicit save', async ({ page }) => {
  await seedStorage(page, { [modeKey]: 'unknown' });
  await page.goto('prime-factor-64.html?mode=unknown');
  await expect(page.locator('#start-mode')).toHaveValue('classic');
  await expect(page.locator('#start-board-size')).toHaveValue('4');
  await expect(page.locator('#start-board-count')).toHaveValue('16');
  await expect(page.locator('#start-recall-count')).toHaveValue('0');
  await page.selectOption('#start-board-size', '16');
  await page.selectOption('#start-mode', 'easy');
  await expect(page.locator('#start-board-size')).toHaveValue('8');
  await expect(page.locator('#start-board-count')).toHaveValue('16');
  await expect(page.locator('#start-recall-count')).toHaveValue('0');
  await page.selectOption('#start-recall-count', '2');
  await page.selectOption('#start-mode', 'classic');
  await expect(page.locator('#start-board-size')).toHaveValue('16');
  await page.selectOption('#start-mode', 'easy');
  await expect(page.locator('#start-recall-count')).toHaveValue('2');
  await page.selectOption('#start-mode', 'classic');
  await page.goto('learning-guide.html');
  await page.getByRole('link', { name: /Easy Mode/ }).click();
  await expect(page.locator('#start-mode')).toHaveValue('easy');
  expect(await page.evaluate(key => localStorage.getItem(key), modeKey)).toBe('classic');
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'End game' }).click();
  await expect(page.locator('#replay-mode')).toHaveValue('easy');
  await page.goto('prime-factor-64.html');
  await expect(page.locator('#start-mode')).toHaveValue('easy');
  await expect(page.locator('#start-board-size')).toHaveValue('8');
  await expect(page.locator('#start-recall-count')).toHaveValue('0');
});

test('G05 Easy mixed sections do not compete for selection, score or row order', async ({ page }) => {
  await startPrime(page, { mode: 'easy', size: 16 });
  const left = await visiblePairs(page, 0);
  const right = await visiblePairs(page, 1);
  await pairButtons(page, left[0], 0)[0].click();
  await pairButtons(page, right[0], 1)[1].click();
  await expect(page.locator('#feedback')).not.toHaveText('Try again.');
  await expect(pairButtons(page, left[0], 0)[0]).toHaveAttribute('aria-pressed', 'false');
  await expect(pairButtons(page, right[0], 1)[1]).toHaveAttribute('aria-pressed', 'true');
  await pairButtons(page, right[0], 1)[0].click();
  await match(page, left[0], { section: 0 });
  await match(page, right[1], { section: 1 });
  await match(page, left[1], { section: 0 });
  for (const [section, pairs] of [[0, left], [1, right]]) {
    const { expressions, results } = boardColumns(page, section);
    await expect(expressions.locator('button').nth(0), 'section-local match order').toHaveText(pairs[0].expression);
    await expect(expressions.locator('button').nth(1), 'section-local match order').toHaveText(pairs[1].expression);
    await expect(results.locator('button').nth(0), 'section-local match order').toHaveText(String(pairs[0].result));
    await expect(results.locator('button').nth(1), 'section-local match order').toHaveText(String(pairs[1].result));
  }
  await clearBoard(page, { section: 0 });
  await expect(page.locator('#board-complete')).toBeHidden();
  await expect(page.locator('#strategy-cues li')).toHaveCount(2);
  expect(await page.locator('#strategy-examples').evaluate(el => el.open)).toBe(false);
  await page.locator('#strategy-examples summary').click();
  for (const example of await page.locator('#strategy-example-list li').allTextContents()) {
    expect(deck.has(Number(example.match(/\d+$/)[0]))).toBe(false);
  }
  await clearBoard(page, { section: 1 });
  await expect(page.locator('#easy-next')).toBeFocused();
});

async function answerCorrect(page) {
  const title = await page.locator('#recall-title').textContent();
  const prompt = title.split(' = ')[0];
  await submitRecall(page, title.endsWith('? × ?') ? deck.get(Number(prompt))[0] : [equationResult(prompt)]);
}

test('G06 Easy replay replaces current misses and recall counts and wraps independently of session index', async ({ page }) => {
  await freeze(page);
  await startPrime(page, { mode: 'easy', size: 8, recall: 2, start: 7 });
  await expect(page.locator('#easy-board-label')).toContainText('Split at 10 3');
  await expect(page.locator('#clock')).toBeHidden();
  await clearBoard(page);
  await answerCorrect(page);
  await answerCorrect(page);
  await page.clock.runFor(1000);
  await expect(page.locator('#board-number')).toHaveText('Board 1 of 2');
  await page.getByRole('button', { name: 'Next board' }).click();
  await expect(page.locator('#easy-board-label')).toContainText('Squares');
  const [first, other] = await visiblePairs(page);
  await pairButtons(page, first)[0].click();
  await pairButtons(page, other)[1].click();
  await clearBoard(page);
  await submitRecall(page, [1]);
  await submitRecall(page, 'reveal');
  await page.getByRole('button', { name: 'Replay board' }).click();
  await expect(page.locator('#progress')).toHaveText('8/16 matched');
  await clearBoard(page);
  await answerCorrect(page);
  await answerCorrect(page);
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.locator('#final-accuracy')).toHaveText('16/16');
  await expect(page.locator('#final-recall')).toHaveText('4/4');
  await expect(page.locator('#review')).toBeHidden();
  await expect(page.locator('#time-stat')).toBeHidden();
});
