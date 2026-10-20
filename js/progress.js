/* progress.js — local best scores and best times, per stage and per mode.
 *
 * Stored in localStorage under one versioned key. If storage is blocked
 * (private mode, disabled cookies) it silently falls back to memory for
 * the session, so the game never breaks over a leaderboard.
 *
 * Modes are grouped: solo, local, online (host and guest share a row —
 * it's the same pair playing the same stage).
 *
 * Row shape:  { score: number|null, timeMs: number|null }
 * key shape:  { "<stageId>": { solo: row, local: row, online: row } }
 */
(function (global) {
  'use strict';
  var KEY = 'leapbuddies.best.v1';
  var memory = null;

  function store() {
    try {
      var s = global.localStorage;
      if (s && typeof s.getItem === 'function') return s;
    } catch (e) { /* access denied */ }
    return null;
  }
  function read() {
    var s = store(), raw = null;
    if (s) { try { raw = s.getItem(KEY); } catch (e) { raw = null; } }
    else raw = memory;
    var data = {};
    if (raw) { try { data = JSON.parse(raw) || {}; } catch (e) { data = {}; } }
    if (!data || typeof data !== 'object') data = {};
    return data;
  }
  function write(data) {
    var raw = JSON.stringify(data);
    var s = store();
    if (s) {
      try { s.setItem(KEY, raw); memory = raw; return true; }
      catch (e) { /* quota or blocked — keep it in memory */ }
    }
    memory = raw;
    return false;
  }

  function modeKey(role) {
    if (role === 'solo') return 'solo';
    if (role === 'local') return 'local';
    return 'online';
  }
  function modeName(role) {
    return { solo: 'Solo', local: 'Local 2P', online: 'Online co-op' }[modeKey(role)];
  }

  function get(stage, role) {
    var all = read();
    var row = all[stage] && all[stage][modeKey(role)];
    return {
      score: row && typeof row.score === 'number' ? row.score : null,
      timeMs: row && typeof row.timeMs === 'number' ? row.timeMs : null
    };
  }

  /* Record a finished run. A game-over run can still set a best score, but
   * only a cleared stage can set a best time (otherwise quitting early
   * would "win" the clock). Returns the new bests plus what was beaten. */
  function submit(stage, role, run) {
    run = run || {};
    var all = read();
    var mode = modeKey(role);
    all[stage] = all[stage] || {};
    var row = all[stage][mode] || { score: null, timeMs: null };

    var out = {
      mode: mode, modeName: modeName(role),
      bestScore: row.score, bestTimeMs: row.timeMs,
      newScore: false, newTime: false, saved: false
    };

    var score = Math.max(0, Math.round(run.score || 0));
    if (row.score == null || score > row.score) {
      row.score = score; out.bestScore = score; out.newScore = true;
    }

    if (run.cleared && typeof run.timeMs === 'number' && isFinite(run.timeMs) && run.timeMs >= 0) {
      var t = Math.round(run.timeMs);
      if (row.timeMs == null || t < row.timeMs) {
        row.timeMs = t; out.bestTimeMs = t; out.newTime = true;
      }
    }

    all[stage][mode] = row;
    out.saved = write(all);
    return out;
  }

  function reset() {
    var s = store();
    if (s) { try { s.removeItem(KEY); } catch (e) { /* ignore */ } }
    memory = null;
  }

  global.Best = {
    key: KEY,
    get: get,
    submit: submit,
    reset: reset,
    modeKey: modeKey,
    modeName: modeName
  };
})(typeof window !== 'undefined' ? window : globalThis);
