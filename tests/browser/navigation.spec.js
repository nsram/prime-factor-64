import { test, expect } from '@playwright/test';
import { batch, observed, progressKey, soundKey } from '../helpers/oracles.mjs';
import { clearBoard, match, pairButtons, readProgress, startPrime, visiblePairs } from '../helpers/browser.mjs';

test('G09 relative links, styles and shared script work at the Pages-style path offline', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const missing = [];
  const unexpected = [];
  page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
  page.on('pageerror', error => unexpected.push(error.message));
  const external = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto('index.html');
  await page.getByRole('link', { name: 'Play Prime Factor 64' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await match(page, (await visiblePairs(page))[0]);
  await page.getByRole('link', { name: 'Prime Factor 64 home' }).click();
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
  await page.getByRole('link', { name: 'Project home' }).click();
  await page.getByRole('link', { name: 'Play Fog Sweep 64' }).click();
  await match(page, (await visiblePairs(page))[0]);
  await page.getByRole('link', { name: 'Project home' }).click();
  for (const [name, pageName] of [
    ['Learn the 64 facts', 'learning-guide'],
    ['How we built Prime Factor 64', 'prime-factor-64-history'],
    ['How we built Fog Sweep 64', 'fog-sweep-64-history'],
  ]) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(baseURL + pageName + '.html');
    await page.getByRole('navigation').first().getByRole('link', { name: 'Home', exact: true }).click();
  }
  expect(missing).toEqual([]);
  expect(external).toEqual([]);
  expect(unexpected).toEqual([]);
});

test('G10 Prime Factor keyboard focus and reset cancellation are usable', async ({ page }) => {
  await page.goto('prime-factor-64.html');
  const start = page.getByRole('button', { name: 'Start game' });
  await start.press('Enter');
  const [first, other] = await visiblePairs(page);
  const [left] = pairButtons(page, first);
  await left.press('Enter');
  await pairButtons(page, other)[1].press('Space');
  await expect(left).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Try again.' })).toBeVisible();
  await match(page, first, { input: 'keyboard' });
  await expect(page.locator('#expressions button:not([disabled])').first()).toBeFocused();
  await page.locator('#home').press('Enter');
  await expect(page.locator('#intro-title')).toBeFocused();
  await page.locator('#manage-progress summary').press('Enter');
  await page.locator('#reset-progress').press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#cancel-reset')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(Object.keys((await readProgress(page)).facts)).toHaveLength(1);
});

test.describe('narrow touch viewport', () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 780 } });

  test('G11 no horizontal overflow; touch works on each layout, recall, review and controls', async ({ page }) => {
    const fits = () => expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const mode of ['classic', 'easy']) {
      for (const size of [4, 8, 16]) {
        await startPrime(page, { mode, size, recall: 2 });
        await fits();
        const section = mode === 'easy' && size === 16 ? 0 : undefined;
        const [pair] = await visiblePairs(page, section);
        await match(page, pair, { section, input: 'tap' });
        await expect(page.locator('#progress')).toHaveText('1/16 matched');
        if (section === 0) {
          const sections = page.locator('#easy-sections .easy-section');
          const [a, b] = await Promise.all([sections.nth(0).boundingBox(), sections.nth(1).boundingBox()]);
          expect(b.y).toBeGreaterThan(a.y);
          await clearBoard(page, { section: 0 });
          await clearBoard(page, { section: 1 });
          await expect(page.locator('#recall')).toBeVisible();
          await fits();
        }
        await page.getByRole('button', { name: 'End game' }).tap();
        await expect(page.locator('#finish')).toBeVisible();
        await fits();
      }
    }
    await page.goto('fog-sweep-64.html');
    await fits();
    for (const id of ['expressions', 'results']) {
      const grid = await page.locator('#' + id).evaluate(element => getComputedStyle(element).gridTemplateColumns);
      expect(grid.split(' ')).toHaveLength(4);
    }
    await match(page, (await visiblePairs(page))[0], { input: 'tap' });
    await clearBoard(page, { fog: true });
    await expect(page.locator('#review')).toBeVisible();
    await fits();
  });
});

async function recordAudio(page) {
  await page.addInitScript(() => {
    window.testAudioStarts = [];
    const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    window.AudioContext = class {
      state = 'running';
      destination = {};
      currentTime = 0;
      createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
      createOscillator() {
        return {
          frequency: param(), connect() {}, stop() {},
          start(time) { window.testAudioStarts.push(time); },
        };
      }
    };
  });
}

test('G12 sound schedules cues and Prime Factor mute persists independently of Fog', async ({ page }) => {
  await recordAudio(page);
  await startPrime(page, { size: 16 });
  const count = () => page.evaluate(() => window.testAudioStarts.length);
  const [first, other] = await visiblePairs(page);
  await pairButtons(page, first)[0].click();
  await pairButtons(page, other)[1].click();
  expect(await count()).toBeGreaterThan(0);
  const afterMiss = await count();
  await match(page, first);
  const afterMatch = await count();
  expect(afterMatch).toBeGreaterThan(afterMiss);
  await page.locator('#sound').click();
  await match(page, other);
  expect(await count()).toBe(afterMatch);
  expect(await page.evaluate(key => localStorage.getItem(key), soundKey)).toBe('off');
  await page.reload();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  await page.goto('fog-sweep-64.html');
  await expect(page.locator('#sound')).toHaveText('Sound on');
  await clearBoard(page, { fog: true });
  expect(await count()).toBeGreaterThan(16);
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveText('Sound off');
  await page.reload();
  await expect(page.locator('#sound')).toHaveText('Sound on');
});

test('G12 denied audio does not interrupt play', async ({ page }) => {
  await page.addInitScript(() => { window.AudioContext = class { constructor() { throw new Error('denied'); } }; });
  await startPrime(page);
  await match(page, (await visiblePairs(page))[0]);
  await expect(page.locator('#progress')).toHaveText('1/16 matched');
  await page.goto('fog-sweep-64.html');
  await match(page, (await visiblePairs(page))[0]);
  await expect(page.locator('#clear-count')).toHaveText('1 / 64');
});

test('P11 different browser contexts and origins do not share practice', async ({ page, browser, baseURL }) => {
  await page.goto('prime-factor-64.html');
  await page.evaluate(({ key, snapshot }) => localStorage.setItem(key, snapshot),
    { key: progressKey, snapshot: JSON.stringify(batch({ 'factors:144': observed(900, false) })) });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Practice weak facts' })).toBeEnabled();
  const isolated = await browser.newContext({ baseURL });
  try {
    const separate = await isolated.newPage();
    await separate.goto('prime-factor-64.html');
    await expect(separate.getByRole('button', { name: 'Practice weak facts' })).toBeDisabled();
    const otherOrigin = new URL(baseURL);
    otherOrigin.hostname = 'localhost';
    const other = await page.context().newPage();
    await other.goto(new URL('prime-factor-64.html', otherOrigin).href);
    await expect(other.getByRole('button', { name: 'Practice weak facts' })).toBeDisabled();
  } finally {
    await isolated.close();
  }
});
