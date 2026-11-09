import { test, expect } from '@playwright/test';
import { deck, easyLayouts, sizes, lengths, teachingPairs } from '../helpers/oracles.mjs';

const seeds = [0, 1, 17, 101, 65537, 0xffffffff, 'zero', 'almost-one'];
const canonical = entries => entries.map(([product, pairs]) =>
  [product, pairs.map(pair => pair.toSorted((a, b) => a - b)).sort((a, b) => a[0] - b[0])])
  .sort(([a], [b]) => a - b);

async function probe(page, game, selectedSeeds = seeds) {
  await page.goto(game + '.html');
  return page.evaluate(seeds => {
    // Classic-script functions are window properties. The top-level const deck is not.
    const freshDeck = window.buildDeck();
    const original = Math.random;
    const deals = [];
    try {
      for (const seed of seeds) {
        let state = Number(seed) >>> 0;
        Math.random = () => {
          if (seed === 'zero') return 0;
          if (seed === 'almost-one') return 1 - Number.EPSILON;
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          return state / 2 ** 32;
        };
        const deal = window.dealBoards
          ? Object.fromEntries([4, 8, 16].map(size => [size, window.dealBoards(freshDeck, size)]))
          : window.dealRounds(freshDeck);
        deals.push({ seed, deal });
      }
    } finally {
      Math.random = original;
    }
    return { entries: [...freshDeck], deals };
  }, selectedSeeds);
}

function validateRun(boards, size, total, context) {
  expect(boards, context).toHaveLength(total / size);
  for (const board of boards) expect(board, context).toHaveLength(size);
  const facts = boards.flat();
  const products = facts.map(({ result }) => result);
  expect(new Set(products).size, context + ' unique products').toBe(total);
  if (total === 64) expect(products.toSorted((a, b) => a - b), context).toEqual([...deck.keys()]);
  for (const { result, factors } of facts) {
    expect(deck.get(result), context + ' allowed expression for ' + result).toContainEqual(factors.toSorted((a, b) => a - b));
    expect(factors[0] * factors[1], context).toBe(result);
  }
}

const countsByEnding = board => Object.values(board.reduce((counts, { result }) => {
  counts[result % 10] = (counts[result % 10] ?? 0) + 1;
  return counts;
}, {}));

test('A01 both live deck builders match the independent oracle', async ({ page }) => {
  for (const game of ['prime-factor-64', 'fog-sweep-64']) {
    const { entries } = await probe(page, game, []);
    expect(canonical(entries), game).toEqual([...deck]);
  }
});

test('A02 A03 Classic seeded deals preserve size, uniqueness and same-ending groups', async ({ page }) => {
  const { deals } = await probe(page, 'prime-factor-64');
  for (const { seed, deal } of deals) {
    for (const size of sizes) {
      for (const length of lengths) validateRun(deal[size].slice(0, length / size), size, length, `seed ${seed}, size ${size}, length ${length}`);
      const histograms = deal[size].map(countsByEnding);
      if (size === 4) {
        const sorted = histograms.map(values => values.toSorted((a, b) => a - b).join(','));
        expect(sorted.filter(value => value === '1,3')).toHaveLength(2);
        expect(sorted.every(value => ['1,3', '2,2', '4'].includes(value))).toBe(true);
      } else {
        expect(histograms.flat().every(count => count >= 2), `seed ${seed}, size ${size}`).toBe(true);
      }
    }
  }
});

test('A04 Easy assignment and one-way strategy predicates across all 112 settings', async ({ page }) => {
  await page.goto('prime-factor-64.html');
  let count = 0;
  for (const size of sizes) {
    const layout = easyLayouts(size);
    const runs = await page.evaluate(({ size, starts, lengths }) =>
      Array.from({ length: starts }, (_, start) => lengths.map(length => window.dealEasyBoards(size, start, length / size))),
    { size, starts: layout.length, lengths });
    for (const [start, byLength] of runs.entries()) {
      for (const [index, boards] of byLength.entries()) {
        const length = lengths[index];
        const context = `size ${size}, start ${start}, length ${length}`;
        validateRun(boards.map(board => board.pairs), size, length, context);
        for (const [position, board] of boards.entries()) {
          const expected = layout[(start + position) % layout.length];
          expect(board.label, context).toBe(expected.label);
          expect(board.sections.map(({ strategy, pairs }) => ({ strategy, results: pairs.map(pair => pair.result) })), context)
            .toEqual(expected.sections);
          for (const section of board.sections) {
            for (const { result, factors: [a, b] } of section.pairs) {
              expect([a, b], context).toEqual(teachingPairs.get(result) ?? deck.get(result)[0]);
              const midpoint = (a + b) / 2;
              const offset = (b - a) / 2;
              // Predicates overlap. They validate an approved assignment in one direction.
              const valid = {
                squares: a === b,
                next: b === a + 1,
                straddle: Number.isInteger(midpoint) && midpoint ** 2 - offset ** 2 === result,
                split: b >= 11 && b <= 19 && 10 * a + (b - 10) * a === result,
              };
              expect(valid[section.strategy], context + ', product ' + result).toBe(true);
            }
          }
        }
        count++;
      }
    }
  }
  expect(count).toBe(112);
});

test('A05 Fog deals open with grouped facts and reveal same-ending waves', async ({ page }) => {
  const { deals } = await probe(page, 'fog-sweep-64');
  for (const { seed, deal } of deals) {
    validateRun(deal, 16, 64, 'Fog seed ' + seed);
    for (const round of deal) {
      expect(countsByEnding(round.slice(0, 8)).every(n => n >= 2), 'opening facts partition into pairs/triples').toBe(true);
      for (let i = 8; i < 16; i += 2) {
        expect(round[i].result % 10, `seed ${seed}, wave ${i}`).toBe(round[i + 1].result % 10);
      }
    }
  }
});
