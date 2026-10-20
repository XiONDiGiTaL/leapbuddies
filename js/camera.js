/* camera.js — framing maths for the 3D view. No THREE, no DOM, so the
 * whole thing is smoke-tested in Node alongside the engine.
 *
 * The renderer used to show a fixed 512x288 slice of the world, which on a
 * phone draws a 22-unit-tall buddy at about fourteen screen pixels — too
 * small to read, let alone jump with. This module answers two questions
 * every frame:
 *
 *   1. How far in can the camera zoom before the buddy is readable?
 *   2. How far back out must it go so the co-op partner is still visible?
 *
 * The camera is orthographic, so "zoom" is just the half-width of the
 * frustum: smaller means closer. Everything is in world units, which are
 * 1:1 with the engine's pixels.
 */
(function (global) {
  'use strict';

  var VIEW_W = 512, VIEW_H = 288;
  var YAW = 0.30, COS_YAW = Math.cos(YAW);   /* same three-quarter view as render3d */

  /* A buddy is 22 world units tall (engine.js makePlayer -> h: 22). At 26
   * screen pixels the silhouette, hair and sneakers are all legible; below
   * about 18 they dissolve into a coloured smudge. */
  var PLAYER_H = 22;
  var MIN_PLAYER_PX = 26;

  /* Breathing room between a buddy and the edge of the frame, and a hard
   * floor on zoom-in so the player still sees the ground ahead. */
  var SIDE_PAD = 26;
  var MIN_HALF_W = 104;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* The old fixed framing rule, kept exactly: 16:9 shows the full 512-unit
   * play width, anything narrower stops shrinking the world and grows the
   * box instead. */
  function baseHalfWidth(cssW, cssH) {
    var aspect = Math.max(0.2, cssW / Math.max(1, cssH));
    var halfH = VIEW_H / 2;
    var halfW = halfH * aspect / COS_YAW;
    if (halfW < VIEW_W / 2) {
      halfW = VIEW_W / 2;
      halfH = halfW * COS_YAW / aspect;
    }
    return { halfW: halfW, halfH: halfH, aspect: aspect };
  }

  /* Center of a buddy, not their left edge. */
  function playerX(p) {
    return p.x + (typeof p.w === 'number' ? p.w : 12) / 2;
  }

  function livePlayers(players) {
    var out = [];
    if (!players) return out;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p || p.absent || typeof p.x !== 'number' || !isFinite(p.x)) continue;
      out.push(p);
    }
    return out;
  }

  /**
   * frame({ cssW, cssH, levelW, center, players, zoom })
   *
   *   cssW/cssH  size of the canvas in CSS pixels
   *   levelW     level width in world units (200 tiles * 16 = 3200)
   *   center     the engine's camera centre, in world units
   *   players    engine player objects ({ x, w, absent, state })
   *   zoom       false to pin the old fixed framing (debug / reduced motion)
   *
   * Returns { halfW, halfH, baseHalfW, baseHalfH, aspect, centerX, centerY,
   *           zoom, mix } where halfW/halfH are the frustum halves to use,
   *           centerX/centerY the point to look at, and zoom is relative to
   *           the old fixed view (1 = untouched, 2 = twice as close).
   */
  function frame(o) {
    o = o || {};
    var cssW = Math.max(160, o.cssW || VIEW_W);
    var cssH = Math.max(90, o.cssH || VIEW_H);
    var base = baseHalfWidth(cssW, cssH);
    var levelW = Math.max(0, o.levelW || 200 * 16);

    /* --- 1. how close can we get before the buddy is too big to play? --- */
    /* On-screen height of a 22-unit buddy is cssH * PLAYER_H / (2 * halfH).
     * Solve for the halfH that renders it exactly MIN_PLAYER_PX tall. */
    var wantHalfH = PLAYER_H * cssH / (2 * MIN_PLAYER_PX);
    var readable = 0;
    if (wantHalfH < base.halfH) {
      readable = wantHalfH * base.aspect / COS_YAW;
      if (readable < MIN_HALF_W) readable = MIN_HALF_W;
    }

    /* --- 2. how far out must we stay for the partner? --- */
    var live = livePlayers(o.players);
    var mid = o.center || 0;
    var fit = 0;
    if (live.length) {
      var lo = playerX(live[0]), hi = lo;
      for (var i = 1; i < live.length; i++) {
        var x = playerX(live[i]);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      mid = (lo + hi) / 2;
      if (live.length > 1) {
        /* half the gap plus room to see each buddy whole (their centre is
         * already in the maths, so this is one body width plus padding) */
        fit = ((hi - lo) / 2 + 6 + SIDE_PAD) * COS_YAW;
      }
    }

    /* `readable` is the zoom-in target; `fit` is only a limit on how far in
     * we may go. With no readable target (desktop) the view never changes,
     * which keeps the original framing exactly. */
    var halfW = readable > 0 ? Math.min(base.halfW, Math.max(readable, fit)) : base.halfW;
    if (o.zoom === false) halfW = base.halfW;

    var halfH = halfW * COS_YAW / base.aspect;
    var zoom = base.halfW / halfW;

    /* At the old framing keep the engine's camera untouched. Once zoomed,
     * re-centre between the buddies so neither sits at the cut edge, then
     * keep the frame inside the level. The renderer eases towards this
     * centre, so the hand-off reads as a glide rather than a cut. */
    var centerX = o.center || 0;
    var mix = 0;
    if (halfW < base.halfW - 0.5) {
      mix = 1;
      var worldHalf = halfW / COS_YAW;
      var loC = worldHalf, hiC = levelW - worldHalf;
      if (hiC < loC) centerX = levelW / 2;
      else centerX = clamp(mid, loC, hiC);
    }

    /* Keep the bottom of the old view fixed while zooming: the ground line
     * stays where the player expects it and the extra space is trimmed from
     * the sky, not from under their feet. */
    var centerY = -VIEW_H / 2 - base.halfH + halfH;

    return {
      halfW: halfW, halfH: halfH,
      baseHalfW: base.halfW, baseHalfH: base.halfH, aspect: base.aspect,
      centerX: centerX, centerY: centerY,
      zoom: zoom, mix: mix, live: live.length
    };
  }

  global.LeapCam = {
    frame: frame,
    baseHalfWidth: baseHalfWidth,
    VIEW_W: VIEW_W, VIEW_H: VIEW_H, YAW: YAW,
    PLAYER_H: PLAYER_H, MIN_PLAYER_PX: MIN_PLAYER_PX, MIN_HALF_W: MIN_HALF_W
  };
})(typeof window !== 'undefined' ? window : globalThis);
