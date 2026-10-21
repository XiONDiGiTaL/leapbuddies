/* js/coach.js — first-run coach marks.
 *
 * A new player can read the Field Guide and still not connect "jump on its
 * head" with the critter walking at them. These tips appear inside the stage,
 * anchored to the thing they are about, and each one retires for good as soon
 * as the player performs the lesson once. `choose()` is pure and takes a plain
 * game state, so the headless tests drive it without a DOM.
 */
(function (global) {
  'use strict';

  var KEY = 'leapbuddies.coach.v1';
  var TILE = 16;
  var TIPS = ['stomp', 'kick', 'plates'];

  function store() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  var seen = (function () {
    var s = store(), raw = null;
    if (s) { try { raw = s.getItem(KEY); } catch (e) { raw = null; } }
    if (!raw) return [];
    try {
      var v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter(function (id) { return TIPS.indexOf(id) >= 0; }) : [];
    } catch (e) { return []; }
  })();

  function isSeen(id) { return seen.indexOf(id) >= 0; }
  function save() {
    var s = store();
    if (!s) return;
    try { s.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* blocked */ }
  }
  function mark(id) {
    if (TIPS.indexOf(id) < 0 || isSeen(id)) return false;
    seen.push(id); save();
    return true;
  }
  function reset() { seen.length = 0; save(); }

  /* the buddy the camera is following: first live player on this screen */
  function focusPlayer(st) {
    for (var i = 0; i < st.players.length; i++) {
      var p = st.players[i];
      if (!p.absent && p.state === 'play') return p;
    }
    return null;
  }

  /* Which lesson is worth showing right now, and where. Priority follows the
   * moment the player is in: the gate zone first (it is a one-shot moment),
   * then a loose shell, then a walker to stomp. */
  function choose(st, role) {
    if (!st || role === 'guest') return null;
    if (!st.enemies || !st.players) return null;
    var p = focusPlayer(st);
    if (!p) return null;
    var px = p.x + p.w / 2, py = p.y + p.h / 2;

    if (!isSeen('plates') && !st.gateLatched && px > 54 * TILE && px < 70 * TILE) {
      var sw = null, list = st.switches || [];
      for (var s = 0; s < list.length; s++) {
        var c = list[s];
        if (c.pressed) continue;
        if (!sw || Math.abs(c.tx * TILE + 8 - px) < Math.abs(sw.tx * TILE + 8 - px)) sw = c;
      }
      if (sw) return { id: 'plates', x: sw.tx * TILE + 8, y: sw.ty * TILE + 2 };
    }

    var shell = null, walker = null;
    for (var i = 0; i < st.enemies.length; i++) {
      var e = st.enemies[i];
      if (e.dead) continue;
      var ex = e.x + e.w / 2, ey = e.y + e.h / 2;
      if (Math.abs(ey - py) > 96) continue;
      var dx = Math.abs(ex - px);
      if (e.state === 'shell' && !isSeen('kick') && dx < 210) {
        if (!shell || dx < shell.dx) shell = { id: 'kick', x: ex, y: e.y, dx: dx };
      } else if (e.state === 'walk' && !isSeen('stomp') && dx < 150) {
        if (!walker || dx < walker.dx) walker = { id: 'stomp', x: ex, y: e.y, dx: dx };
      }
    }
    if (shell) return { id: 'kick', x: shell.x, y: shell.y };
    if (walker) return { id: 'stomp', x: walker.x, y: walker.y };
    return null;
  }

  /* ---- the chip that points at the thing ---- */
  var el = null, label = null, shownId = null;

  function init(doc) {
    el = doc.getElementById('coach-tip');
    label = doc.getElementById('coach-text');
  }

  function hide() {
    if (!el) return;
    el.classList.add('off');
    shownId = null;
  }

  /* ctx: { st, role, running, paused, project(x,y) -> {x,y} in stage pixels } */
  function update(ctx) {
    if (!el || !label) return;
    if (!ctx || !ctx.st || !ctx.running || ctx.paused || ctx.role === 'guest' || !ctx.project) return hide();
    var st = ctx.st;

    /* the gate opening is the proof the plate lesson landed */
    if (st.gateLatched || (st.gateOpen || 0) > 0.5) mark('plates');

    var tip = choose(st, ctx.role);
    if (!tip) return hide();
    var xy = ctx.project(tip.x, tip.y);
    if (!xy || !isFinite(xy.x) || !isFinite(xy.y)) return hide();

    /* written every frame it is visible: cheap, and it keeps the label right
     * if the language changes while a tip is up */
    var say = global.I18n ? global.I18n.t('coach.' + tip.id) : tip.id;
    if (label.textContent !== say) { label.textContent = say; shownId = tip.id; }
    var host = el.parentNode;
    var half = (el.offsetWidth || 180) / 2;
    var limit = (host && host.clientWidth ? host.clientWidth : 640) - half - 8;
    var x = Math.max(half + 8, Math.min(xy.x, limit));

    /* near the top of the stage the chip would be clipped, so it hangs below */
    el.classList.toggle('below', xy.y < 92);
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(xy.y) + 'px';
    el.classList.remove('off');
  }

  function events(list) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === 'stomp') mark('stomp');
      else if (list[i] === 'kick') mark('kick');
    }
  }

  var Coach = {
    KEY: KEY, TIPS: TIPS,
    choose: choose, events: events, update: update, init: init, hide: hide,
    mark: mark, isSeen: isSeen, reset: reset,
    seen: function () { return seen.slice(); }
  };
  global.Coach = Coach;
  if (typeof module !== 'undefined' && module.exports) module.exports = Coach;
})(typeof window !== 'undefined' ? window : globalThis);
