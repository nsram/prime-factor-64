import facts from '../fixtures/facts.json' with { type: 'json' };
import easyBoards from '../fixtures/easy-boards.json' with { type: 'json' };

export const deck = new Map(Object.entries(facts).map(([result, pairs]) => [Number(result), pairs]));
export const sizes = [4, 8, 16];
export const lengths = [16, 32, 48, 64];
export const teachingPairs = new Map([[108, [6, 18]], [112, [7, 16]], [126, [7, 18]], [144, [8, 18]]]);
const strategies = { Squares: 'squares', 'Next Door': 'next', Straddle: 'straddle', 'Split at 10': 'split' };

export function easyLayouts(size) {
  const labelStrategy = label => label.replace(/ [1-6]$/, '');
  const batches = Object.entries(easyBoards).map(([label, halves]) => ({
    label,
    strategy: strategies[labelStrategy(label)],
    halves,
  }));
  if (size === 4) {
    const counters = {};
    return batches.flatMap(({ label, strategy, halves }) => {
      const name = labelStrategy(label);
      return halves.map(results => {
        counters[name] = (counters[name] ?? 0) + 1;
        return { label: name + ' ' + counters[name], sections: [{ strategy, results }] };
      });
    });
  }
  const standard = Object.fromEntries(batches.map(({ label, strategy, halves }) =>
    [label, { label, sections: [{ strategy, results: halves.flat() }] }]));
  if (size === 8) return Object.values(standard);
  return [
    ['Squares', 'Next Door'],
    ['Straddle 1', 'Split at 10 1'],
    ['Straddle 2', 'Split at 10 2'],
    ['Straddle 3', 'Split at 10 3'],
  ].map(labels => ({ label: labels.join(' + '), sections: labels.flatMap(label => standard[label].sections) }));
}

export const progressKey = 'prime-factor-64:practice-progress';
export const outboxPrefix = progressKey + ':outbox:';
export const modeKey = 'prime-factor-64:mode';
export const soundKey = 'prime-match-55:sound';
export const batch = (facts = {}, best = {}, runIds = []) => ({ version: 1, facts, best, runIds });
export const observed = (seen, correct) => ({ seen, missed: correct ? 0 : seen, correct: correct ? [seen] : [] });
