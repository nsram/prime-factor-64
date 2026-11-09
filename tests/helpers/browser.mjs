import { expect } from '@playwright/test';
import { progressKey, outboxPrefix } from './oracles.mjs';

export async function seedStorage(page, entries) {
  await page.addInitScript(({ entries, flag }) => {
    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, '1');
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, { entries, flag: 'pf64-test:seed' });
}

export async function freeze(page) {
  const start = Date.parse('2026-11-07T15:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start + 1000);
}

export async function startPrime(page, { mode = 'classic', size = 4, length = 16, recall = 0, start = 0 } = {}) {
  await page.goto('prime-factor-64.html');
  await page.selectOption('#start-mode', mode);
  await page.selectOption('#start-board-size', String(size));
  await page.selectOption('#start-board-count', String(length));
  await page.selectOption('#start-recall-count', String(recall));
  if (mode === 'easy') await page.selectOption('#start-easy-start', String(start));
  await page.getByRole('button', { name: 'Start game' }).click();
}

export const equationResult = expression =>
  expression.match(/\d+/g).reduce((product, factor) => product * Number(factor), 1);

export function boardColumns(page, section) {
  if (section === undefined) return { expressions: page.locator('#expressions'), results: page.locator('#results') };
  const columns = page.locator('#easy-sections section.easy-section').nth(section).locator('.cards');
  return { expressions: columns.nth(0), results: columns.nth(1) };
}

export async function visiblePairs(page, section) {
  const { expressions, results } = boardColumns(page, section);
  const playable = 'button:not([disabled])';
  const products = await results.locator(playable).allTextContents();
  const pairs = (await expressions.locator(playable).allTextContents()).map(expression =>
    ({ expression: expression.trim(), result: equationResult(expression) }));
  expect(products.map(Number).sort((a, b) => a - b), 'visible products correspond on both sides')
    .toEqual(pairs.map(pair => pair.result).sort((a, b) => a - b));
  return pairs;
}

export function pairButtons(page, pair, section) {
  const { expressions, results } = boardColumns(page, section);
  return [expressions.getByText(pair.expression, { exact: true }), results.getByText(String(pair.result), { exact: true })];
}

export async function match(page, pair, { section, reverse = false, input = 'click' } = {}) {
  const buttons = pairButtons(page, pair, section);
  if (reverse) buttons.reverse();
  for (const button of buttons) {
    if (input === 'keyboard') await button.press('Enter');
    else if (input === 'tap') await button.tap();
    else if (input === 'dom') await button.evaluate(element => element.click());
    else await button.click();
  }
}

export async function clearBoard(page, { fog = false, section } = {}) {
  // Full-run fixtures use real DOM click handlers without actionability waits on every card.
  // The UX checks separately exercise pointer, touch and keyboard actionability.
  const { expressions, results } = boardColumns(page, section);
  const expressionId = await expressions.evaluate(element => element.id);
  if (section !== undefined || expressionId !== 'expressions') {
    for (const pair of await visiblePairs(page, section)) await match(page, pair, { section, input: 'dom' });
    return;
  }
  await results.evaluate((right, fog) => {
    const left = document.querySelector('#expressions');
    const selector = 'button:not([disabled])';
    const rounds = fog ? 16 : left.querySelectorAll(selector).length;
    for (let index = 0; index < rounds; index++) {
      const first = left.querySelector(selector);
      if (!first || document.querySelector('#boards')?.hidden) break;
      const product = first.textContent.match(/\d+/g).reduce((value, factor) => value * Number(factor), 1);
      const second = [...right.querySelectorAll(selector)].find(button => Number(button.textContent) === product);
      if (!second) throw new Error('No visible counterpart for ' + product);
      first.click();
      second.click();
    }
  }, fog);
}

export async function submitRecall(page, answers, { advance = true } = {}) {
  if (answers === 'reveal') {
    await page.getByRole('button', { name: 'Show answer' }).click();
  } else {
    await page.locator('#recall-first').fill(String(answers[0]));
    if (answers.length === 2) await page.locator('#recall-second').fill(String(answers[1]));
    await page.getByRole('button', { name: 'Check answer' }).click();
  }
  const feedback = await page.locator('#recall-answer').textContent();
  if (advance) await page.locator('#recall-next').click();
  return feedback;
}

export const readProgress = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey);
export const stageKeys = page => page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)), outboxPrefix);

export async function holdProgressLock(page) {
  const granted = await page.evaluate(key => {
    if (!navigator.locks) return false;
    return new Promise(resolve => {
      navigator.locks.request(key, () => new Promise(release => {
        window.releaseTestProgressLock = release;
        resolve(true);
      }));
    });
  }, progressKey);
  expect(granted, 'the native browser lock must be available').toBe(true);
  return () => page.evaluate(() => window.releaseTestProgressLock());
}
