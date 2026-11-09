import { test, expect } from '@playwright/test';
import { batch, observed, progressKey } from '../helpers/oracles.mjs';
import { pairButtons, readProgress, seedStorage, startPrime, visiblePairs } from '../helpers/browser.mjs';

test.skip(!process.env.PF64_DIAGNOSTICS, 'opt-in observation of unresolved policy');

for (const exit of ['reload', 'project home']) {
  test('P10 Q01 Classic unstaged attempt on ' + exit, async ({ page }, info) => {
    await startPrime(page);
    const [first, wrong] = await visiblePairs(page);
    await pairButtons(page, first)[0].click();
    await pairButtons(page, wrong)[1].click();
    await expect(page.locator('#feedback')).toHaveText('Try again.');
    const before = await readProgress(page);
    if (exit === 'reload') await page.reload();
    else await page.getByRole('link', { name: 'Project home' }).click();
    const after = await readProgress(page);
    const result = { exit, before, after };
    console.log(JSON.stringify(result));
    await info.attach('observation', { body: JSON.stringify(result), contentType: 'application/json' });
  });
}

test('L07 Q04 accepted raw snapshot with two same-day correct times', async ({ page }, info) => {
  const first = Date.parse('2026-11-08T16:00:00Z');
  const facts = batch({
    'factors:144': { ...observed(first + 1000, true), missed: first - 1, correct: [first, first + 1000] },
  });
  await seedStorage(page, { [progressKey]: JSON.stringify(facts) });
  await page.goto('prime-factor-64.html');
  await expect(page.locator('#practice-summary')).not.toBeEmpty();
  const result = { promptEligible: await page.getByRole('button', { name: 'Practice weak facts' }).isEnabled() };
  console.log(JSON.stringify(result));
  await info.attach('observation', { body: JSON.stringify(result), contentType: 'application/json' });
});
