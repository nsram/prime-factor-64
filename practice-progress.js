"use strict";

window.PracticeProgress = (() => {
  const progressKey = "prime-factor-64:practice-progress";
  const corruptProgressKey = progressKey + ":corrupt-backup";
  const outboxPrefix = progressKey + ":outbox:";
  const validRunId = id => typeof id === "string" && /^[0-9a-f]{32}$/.test(id);
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

    function validateProgress(data) {
      const object = value => value && typeof value === "object" && !Array.isArray(value);
      const time = value => Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
      if (data?.version !== 1 || !object(data.facts) || !object(data.best)) throw new Error("Unknown progress format");
      const runIds = data.runIds === undefined ? [] : data.runIds;
      if (!Array.isArray(runIds) || !runIds.every(validRunId)) {
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

    function parse(text) {
      return validateProgress(JSON.parse(text));
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

    function outboxKeys() {
      return Object.keys(localStorage).filter(key => key.startsWith(outboxPrefix));
    }

    function readOutboxEntry(key, text) {
      try {
        const { changes, completedRun } = JSON.parse(text);
        const checked = validateProgress(changes);
        if (completedRun !== null) {
          const { id, mode, best } = completedRun;
          validateProgress({ ...empty(), best: { [mode]: best }, runIds: [id] });
        }
        return { changes: checked, completedRun };
      } catch {
        localStorage.setItem(corruptProgressKey + ":" + key.slice(outboxPrefix.length), text);
        return null;
      }
    }

    function syncSaved(unstaged = null, completedRun = null) {
      const saved = readSaved();
      const keys = outboxKeys();
      if (!storageAvailable) merge(saved, state);
      for (const key of keys) {
        const text = localStorage.getItem(key);
        if (text === null) continue;
        const entry = readOutboxEntry(key, text);
        if (entry) merge(saved, entry.changes, entry.completedRun);
      }
      if (unstaged) merge(saved, unstaged, completedRun);
      // Keep entries until the main write succeeds. Replaying a batch is safe.
      if (keys.length || unstaged || !storageAvailable) {
        localStorage.setItem(progressKey, JSON.stringify(saved));
        for (const key of keys) localStorage.removeItem(key);
      }
      state = saved;
      storageAvailable = true;
    }

    function refresh() {
      return withProgressLock(() => {
        try {
          syncSaved();
        } catch {
          storageAvailable = false;
        }
        onChange?.();
      });
    }

    function save(changes, completedRun = null) {
      let unstaged = changes;
      try {
        // A separate key per batch avoids a read-modify-write race across tabs.
        const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),
          byte => byte.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(outboxPrefix + id, JSON.stringify({ changes, completedRun }));
        unstaged = null;
      } catch {
        // Try the direct write under the lock if the outbox could not be written.
      }
      return withProgressLock(() => {
        try {
          syncSaved(unstaged, completedRun);
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
          for (const key of outboxKeys()) localStorage.removeItem(key);
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
        if (event.key === progressKey || event.key === null ||
            (event.key.startsWith(outboxPrefix) && event.newValue !== null)) refresh();
      });
    } else {
      // Prime Factor refreshes after wiring its UI. Fog Sweep drains on load too.
      refresh();
    }

    return {
      get state() { return state; },
      get storageAvailable() { return storageAvailable; },
      parse, refresh, save, reset
    };
  }

  return { createStore, empty, matchId, recallId, observation };
})();
