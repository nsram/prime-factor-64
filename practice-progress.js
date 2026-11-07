"use strict";

window.PracticeProgress = (() => {
  const progressKey = "prime-factor-64:practice-progress";
  const corruptProgressKey = progressKey + ":corrupt-backup";
  // These mode keys belong to the version 1 Prime Factor backup format.
  const modeLimits = new Map([4, 8, 16].flatMap(size => [16, 32, 48, 64].flatMap(length =>
    [0, 2, 4].map(recall => [`${size}:${length}:${recall}`, length])
  )));

  function factorId(pair) {
    const [a, b] = pair.factors;
    return Math.min(a, b) + "×" + Math.max(a, b);
  }

  function matchId(pair) {
    return "match:" + factorId(pair);
  }

  function recallId(pair, reverse) {
    return reverse ? "factors:" + pair.result : "product:" + factorId(pair);
  }

  function empty() {
    return { version: 1, facts: {}, best: {}, runIds: [] };
  }

  function observation(correct, seen = Date.now()) {
    return { seen, missed: correct ? 0 : seen, correct: correct ? [seen] : [] };
  }

  function distinctDays(times, after) {
    const days = new Map();
    for (const at of times.sort((a, b) => a - b)) {
      if (at > after) days.set(new Date(at).toDateString(), at);
    }
    return Array.from(days.values()).slice(-2);
  }

  function mergeBest(base, mode, best) {
    const previous = base.best[mode];
    const perfectMs = Math.min(previous?.perfectMs ?? Infinity, best.perfectMs ?? Infinity);
    base.best[mode] = {
      firstTry: Math.max(previous?.firstTry ?? 0, best.firstTry),
      perfectMs: Number.isFinite(perfectMs) ? perfectMs : null
    };
  }

  function merge(base, changes, completedRun = null) {
    for (const [id, fact] of Object.entries(changes.facts)) {
      const previous = base.facts[id];
      const missed = Math.max(previous?.missed ?? 0, fact.missed);
      base.facts[id] = {
        seen: Math.max(previous?.seen ?? 0, fact.seen),
        missed,
        correct: distinctDays([...(previous?.correct ?? []), ...fact.correct], missed)
      };
    }
    for (const [mode, best] of Object.entries(changes.best)) {
      mergeBest(base, mode, best);
    }
    if (changes.runIds.length) base.runIds = [...new Set([...base.runIds, ...changes.runIds])];
    if (completedRun && !base.runIds.includes(completedRun.id)) {
      base.runIds.push(completedRun.id);
      mergeBest(base, completedRun.mode, completedRun.best);
    }
  }

  async function withProgressLock(action) {
    let started = false;
    try {
      if (navigator.locks) {
        return await navigator.locks.request(progressKey, () => {
          started = true;
          return action();
        });
      }
    } catch (error) {
      if (started) throw error;
      // A local file or restricted browser can deny access to Web Locks.
    }
    return action();
  }

  function createStore(deck, { onChange, onRecovery } = {}) {
    const factIds = new Set();
    for (const [result, options] of deck) {
      factIds.add(recallId({ result }, true));
      for (const factors of options) {
        const pair = { result, factors };
        factIds.add(matchId(pair));
        factIds.add(recallId(pair, false));
      }
    }
    let state = empty();
    let storageAvailable = true;

    function parse(text) {
      const data = JSON.parse(text);
      const object = value => value && typeof value === "object" && !Array.isArray(value);
      const time = value => Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
      if (data?.version !== 1 || !object(data.facts) || !object(data.best)) throw new Error("Unknown progress format");
      const runIds = data.runIds === undefined ? [] : data.runIds;
      if (!Array.isArray(runIds) || !runIds.every(id => typeof id === "string" && /^[0-9a-f]{32}$/.test(id))) {
        throw new Error("Invalid completed run IDs");
      }
      for (const [id, fact] of Object.entries(data.facts)) {
        if (!factIds.has(id) || !object(fact) || !time(fact.seen) || !time(fact.missed) || fact.missed > fact.seen ||
            !Array.isArray(fact.correct) || fact.correct.length > 2 ||
            !fact.correct.every(at => time(at) && at > fact.missed && at <= fact.seen)) {
          throw new Error("Invalid fact history");
        }
      }
      for (const [mode, best] of Object.entries(data.best)) {
        const limit = modeLimits.get(mode);
        if (!limit || !object(best) || !Number.isInteger(best.firstTry) || best.firstTry < 0 ||
            best.firstTry > limit || (best.perfectMs !== null && (!time(best.perfectMs) || best.firstTry !== limit))) {
          throw new Error("Invalid personal best");
        }
      }
      return { version: 1, facts: data.facts, best: data.best, runIds: [...new Set(runIds)] };
    }

    function readSaved() {
      const saved = localStorage.getItem(progressKey);
      if (saved === null) return empty();
      try {
        return parse(saved);
      } catch {
        // Save the original text before removing the damaged record.
        localStorage.setItem(corruptProgressKey, saved);
        localStorage.removeItem(progressKey);
        onRecovery?.();
        return empty();
      }
    }

    function refresh() {
      return withProgressLock(() => {
        try {
          const saved = readSaved();
          if (!storageAvailable) merge(saved, state);
          state = saved;
        } catch {
          storageAvailable = false;
        }
        onChange?.();
      });
    }

    function save(changes, completedRun = null) {
      return withProgressLock(() => {
        try {
          const saved = readSaved();
          if (!storageAvailable) merge(saved, state);
          merge(saved, changes, completedRun);
          localStorage.setItem(progressKey, JSON.stringify(saved));
          state = saved;
          storageAvailable = true;
        } catch {
          merge(state, changes, completedRun);
          storageAvailable = false;
        }
        onChange?.();
        return storageAvailable;
      });
    }

    function reset() {
      return withProgressLock(() => {
        try {
          localStorage.removeItem(progressKey);
          storageAvailable = true;
        } catch {
          if (storageAvailable) return false;
        }
        state = empty();
        onChange?.();
        return true;
      });
    }

    if (onChange) {
      window.addEventListener("storage", event => {
        if (event.key === progressKey || event.key === null) refresh();
      });
    }

    return {
      get state() { return state; },
      get storageAvailable() { return storageAvailable; },
      parse, refresh, save, reset
    };
  }

  return { createStore, empty, matchId, recallId, observation };
})();
