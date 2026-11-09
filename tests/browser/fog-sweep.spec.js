import { test, expect } from '@playwright/test';
import { clearBoard, freeze, match, pairButtons, visiblePairs } from '../helpers/browser.mjs';

const covered = page => page.locator('#expressions button[data-state="covered"]');
const resultCovered = page => page.locator('#results button[data-state="covered"]');

test('A07 G07 Fog reveals exactly two facts after each second success and completes all rounds', async ({ page }) => {
  await freeze(page);
  await page.goto('fog-sweep-64.html');
  await expect(covered(page)).toHaveCount(8);
  await expect(resultCovered(page)).toHaveCount(8);
  await expect(covered(page).first()).toBeDisabled();
  for (let cleared = 1; cleared <= 8; cleared++) {
    const [pair] = await visiblePairs(page);
    await match(page, pair, { reverse: cleared % 2 === 0, input: 'dom' });
    const remaining = 8 - 2 * Math.floor(cleared / 2);
    await expect(covered(page), 'covered tiles after ' + cleared + ' matches').toHaveCount(remaining);
    await expect(resultCovered(page)).toHaveCount(remaining);
    await expect(page.locator('#expressions button[data-state="cleared"]')).toHaveCount(cleared);
  }
  await clearBoard(page, { fog: true });
  await expect(page.locator('#review-title')).toHaveText('Round 1 review');
  await expect(page.locator('#review-title')).toBeFocused();
  await expect(page.locator('#pause')).toBeDisabled();
  for (let round = 2; round <= 4; round++) {
    await page.clock.runFor(3000);
    await page.getByRole('button', { name: 'Next round' }).click();
    await expect(page.locator('#round-number')).toHaveText(round + ' / 4');
    const [first] = await visiblePairs(page);
    const [left, right] = pairButtons(page, first);
    await left.evaluate(button => button.click());
    await page.clock.runFor(round * 100);
    await right.evaluate(button => button.click());
    await clearBoard(page, { fog: true });
  }
  await expect(page.locator('#clear-count')).toHaveText('64 / 64');
  await expect(page.locator('#review-title')).toHaveText('Game complete');
  await expect(page.locator('#round-scores tr')).toHaveCount(4);
  await expect(page.locator('#total-score td')).toHaveText(['64 / 64', '0:00.9']);
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('#round-number')).toHaveText('1 / 4');
  await expect(page.locator('#clear-count')).toHaveText('0 / 64');
  await expect(covered(page)).toHaveCount(8);
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#review')).toBeHidden();
});

test('G08 Fog Slow boundary uses active time and review preserves expression positions', async ({ page }) => {
  await freeze(page);
  await page.goto('fog-sweep-64.html');
  const opening = await page.locator('#expressions button').allTextContents();
  const [fast, boundary, slow, wrong] = await visiblePairs(page);
  await page.clock.runFor(3000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.clock.runFor(10000);
  await page.getByRole('button', { name: 'Resume' }).click();
  for (const [pair, duration] of [[fast, 4999], [boundary, 5000], [slow, 5001]]) {
    const [left, right] = pairButtons(page, pair);
    if (pair === slow) {
      await left.evaluate(button => button.click());
      await pairButtons(page, wrong)[1].evaluate(button => button.click());
      await expect(page.locator('#feedback')).toContainText('don’t match');
    }
    await left.evaluate(button => button.click());
    if (pair === fast) {
      await page.getByRole('button', { name: 'Pause' }).click();
      await expect(page.locator('#boards')).toBeHidden();
      await right.evaluate(button => button.click());
      await page.clock.runFor(20000);
      await page.getByRole('button', { name: 'Resume' }).click();
      await expect(left).toHaveAttribute('aria-pressed', 'true');
    }
    await page.clock.runFor(duration);
    await right.evaluate(button => button.click());
  }
  await clearBoard(page, { fog: true });
  const review = page.locator('#review-grid .review-cell');
  for (const [pair, label] of [[fast, 'First try'], [boundary, 'Slow'], [slow, 'Retry + slow']]) {
    const cell = review.nth(opening.indexOf(pair.expression));
    await expect(cell.locator('.review-expression')).toHaveText(pair.expression);
    await expect(cell.locator('.review-detail'), 'threshold for ' + pair.expression).toHaveText(label);
  }
  await expect(page.locator('#first-try')).toHaveText('15 / 16');
  await expect(page.locator('#round-time')).toHaveText('Round time 0:15.0');
});

test('G10 G13 Fog keyboard selection, Escape, disabled tiles and rapid repeat', async ({ page }) => {
  await page.goto('fog-sweep-64.html');
  await expect(page.getByRole('button', { name: 'Covered tile' }).first()).toBeDisabled();
  const [pair] = await visiblePairs(page);
  const [left, right] = pairButtons(page, pair);
  await left.press('Space');
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(left).toHaveAttribute('aria-pressed', 'false');
  await left.press('Enter');
  await right.press('Enter');
  await expect(page.locator('#expressions button:not([disabled])').first()).toBeFocused();
  await expect(page.locator('#clear-count')).toHaveText('1 / 64');
  await page.locator('#results button[data-state="cleared"]').evaluate(button => {
    button.click();
    button.click();
  });
  await expect(page.locator('#clear-count')).toHaveText('1 / 64');
});
