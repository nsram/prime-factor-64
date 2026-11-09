const prime = 'prime-factor-64.html';
const fog = 'fog-sweep-64.html';
const progress = 'practice-progress.js';
const browser = (id, file, edits, detector, assertion) => ({ id, file, edits, detector, assertion, level: 'browser' });
const unit = (id, file, edits, detector, assertion) => ({ id, file, edits, detector, assertion, level: 'unit' });

export const cases = [
  browser('M01', prime, [['result <= 100', 'result <= 104']], 'A01 both live', /toEqual/),
  browser('M02', prime, [['if (second === 10 || result <= 100) continue;',
    'if (second === 10 || result <= 100 || (first === 9 && second === 16)) continue;']], 'A01 both live', /toEqual/),
  browser('M03', prime, [['[104, 120, 136, 152,', '[105, 120, 136, 152,']], 'A04 Easy', /unique products|toEqual/),
  browser('M04', prime, [
    ['[105, 112, 126, 133,', '[104, 112, 126, 133,'],
    ['[104, 120, 136, 152,', '[105, 120, 136, 152,'],
  ], 'A04 Easy', /toEqual/),
  browser('M05', prime, [['(start + index) % layouts.length', 'Math.min(start + index, layouts.length - 1)']], 'A04 Easy', /unique products|toEqual/),
  browser('M06', fog, [['roundCleared % revealSize === 0 ? revealNext() : 0', 'revealNext()']], 'G07 Fog reveals', /covered tiles after 1 matches/),
  browser('M07', prime, [['missed.add(first.pair);', 'missed.add(card.pair);']], 'G01 Classic aligns', /review-list|final-accuracy/),
  browser('M08', prime, [['column.children[card.group.matched]', 'column.children[boardMatches]']], 'G05 Easy mixed', /section-local match order/),
  browser('M09', prime, [['recallAttempts = recallBeforeBoard.attempts;', '/* keep previous recall attempts */']], 'G06 Easy replay', /final-recall/),
  browser('M10', prime, [['practiceStore && (practicing || !easyGame)', 'practiceStore && (practicing || !easyGame || reveal)']], 'L05 Easy mistakes', /Easy must not write shared progress/),
  browser('M11', prime, [['if (advanceAt !== null) window.clearTimeout(advanceTimer);', '/* advance timer continues while paused */']], 'G03 Classic pause freezes', /board-number/),
  browser('M12', fog, [['elapsed >= slowSeconds * 1000', 'elapsed > slowSeconds * 1000']], 'G08 Fog Slow', /threshold for/),
  unit('M13', progress, [['days.set(new Date(at).toDateString(), at)', 'days.set(at, at)']], 'P02 L03 merge', /deepStrictEqual/),
  browser('M14', prime, [['missesIncluded >= 5', 'missesIncluded >= 6']], 'L02 drill caps', /five distinct weak products/),
  browser('M15', fog, [
    ['const { retried, seen } = roundPerformance.get(pair.result);', 'const { retried, seen, elapsed } = roundPerformance.get(pair.result);'],
    ['practiceStorage.observation(!retried, seen)', 'practiceStorage.observation(!retried && elapsed < slowSeconds * 1000, seen)'],
  ], 'L04 completed Fog', /Slow first try is not a miss/),
  browser('M16', progress, [['localStorage.setItem(outboxPrefix + id,', 'localStorage.setItem(outboxPrefix + "shared",']], 'P04 two native-lock', /each writer stages its own key/),
  browser('M17', progress, [
    ['function save(changes, completedRun = null) {\n      let unstaged', 'function save(changes, completedRun = null) {\n      return withProgressLock(() => {\n      let unstaged'],
    ['return withProgressLock(() => {\n        try {\n          syncSaved(unstaged, completedRun);', 'try {\n          syncSaved(unstaged, completedRun);'],
  ], 'P05 fog staged', /save is staged before navigation/),
  unit('M18', progress, [['for (const key of keys) localStorage.removeItem(key);', 'for (const key of outboxKeys()) localStorage.removeItem(key);']], 'P06 a late', /late entry survives first drain/),
  unit('M19', progress, [['completedRun && !base.runIds.includes(completedRun.id)', 'completedRun']], 'P03 duplicate', /replay must not commit a duplicate run ID/),
  unit('M20', progress, [['localStorage.setItem(corruptProgressKey, saved);', '/* discard corrupt bytes */']], 'P07 recover', /strictEqual/),
  browser('M21', progress, [['if (navigator.locks) {', 'if (false) {']], 'P04 two native-lock', /main snapshot stays untouched/),
  browser('M22', progress, [['for (const key of outboxKeys()) localStorage.removeItem(key);', '/* leave queued batches */']], 'P08 export flushes', /reset removes captured batches|Practice weak facts/),
];
