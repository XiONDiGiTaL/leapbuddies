/* engine.js — original co-op platformer simulation.
 * Pure logic: no DOM, no canvas. Runs in the browser (window.Engine)
 * and in Node (module.exports) for headless smoke tests.
 * Fixed-timestep: one step() == 1/60s of game time.
 */
(function (global) {
  'use strict';

  var TILE = 16;
  var VIEW_W = 512, VIEW_H = 288;
  var T = { EMPTY: 0, SOLID: 1, BRICK: 2, QBLOCK: 3, PBLOCK: 4, USED: 5, GATE: 6 };
  var LEVEL_W = 200, LEVEL_H = 18;

  /* Co-op catch-up rule. When the two players split further than
   * SPLIT_FOLLOW the camera follows whoever is ahead, and once the one
   * behind is off the left edge (CARRY_GAP) they are swept up in a carry
   * bubble and floated back to their partner, so nobody can drag the
   * camera backwards or get stranded off-screen. */
  var SPLIT_FOLLOW = 190;
  var CARRY_GAP = 250;

  /* ------------------------------------------------------------------ */
  /* Level construction (all layout is original, built from helpers)     */
  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /* Stage layouts                                                       */
  /*                                                                    */
  /* Each city gets its own terrain: beach steps in İzmir, alley towers  */
  /* in New York, one long dome terrace in İstanbul, low dunes in Tampa. */
  /* Four anchors never move, because netplay, the checkpoint and the    */
  /* goal test depend on them: the gate tower at tx 70, the two floor    */
  /* plates at 63 and 66, the midpoint flag at 92 and the goal plateau   */
  /* from 169. Everything between those anchors is per-stage data, and   */
  /* each stage mixes its own themed critters with the plain walker and  */
  /* the sheller so the shell mechanic is on every map.                  */
  /* ------------------------------------------------------------------ */
  function row(list, x0, x1, ty) {
    for (var x = x0; x <= x1; x++) list.push([x, ty]);
  }
  function dot(list, tx, ty) { list.push([tx, ty]); }

  var KIND = { solid: T.SOLID, brick: T.BRICK, q: T.QBLOCK, p: T.PBLOCK };

  var STAGE_LAYOUTS = {
    /* İzmir — sunset coast. Wide beach, gentle stair steps down to the
     * promenade, dondurma sellers working the crowd. */
    izmir: function () {
      var coins = [];
      dot(coins, 8, 12); dot(coins, 9, 11); dot(coins, 10, 11); dot(coins, 11, 12);
      row(coins, 24, 25, 13); dot(coins, 28, 10); dot(coins, 29, 10);
      row(coins, 44, 46, 12);
      row(coins, 56, 59, 12); row(coins, 59, 66, 6);
      row(coins, 74, 79, 5); row(coins, 76, 80, 13);
      dot(coins, 86, 10); dot(coins, 88, 8);
      row(coins, 93, 95, 13);
      row(coins, 115, 128, 9);
      row(coins, 138, 141, 13);
      row(coins, 170, 174, 7); dot(coins, 183, 7); dot(coins, 184, 7);
      return {
        grounds: [[0, 29], [34, 47], [53, 68], [69, 84], [90, 104], [135, 151], [156, 159]],
        blocks: [
          [17, 11, 1, 1, 'brick'], [18, 11, 1, 1, 'q'], [19, 11, 1, 1, 'brick'],
          [20, 11, 1, 1, 'p'], [21, 11, 1, 1, 'brick'],
          [26, 13, 2, 2], [28, 12, 2, 3],
          [40, 11, 1, 1, 'q'], [41, 11, 1, 1, 'brick'], [42, 11, 1, 1, 'q'],
          [56, 11, 2, 1], [58, 10, 2, 1],
          [73, 7, 8, 1],
          [86, 12, 2, 1], [88, 10, 2, 1],
          [98, 11, 1, 1, 'brick'], [99, 11, 1, 1, 'q'], [100, 11, 1, 1, 'brick'],
          [113, 12, 10, 6], [123, 13, 8, 5], [131, 14, 4, 4],
          [144, 11, 1, 1, 'brick'], [145, 11, 1, 1, 'q'], [146, 11, 1, 1, 'brick'],
          [160, 13, 3, 5], [163, 11, 3, 7], [166, 9, 3, 9]
        ],
        coins: coins,
        enemies: [
          { type: 'walker', tx: 14 },
          { type: 'walker', skin: 'icecream', tx: 38 },
          { type: 'sheller', tx: 57 },
          { type: 'walker', skin: 'icecream', tx: 66 },
          { type: 'walker', tx: 78 },
          { type: 'walker', skin: 'icecream', tx: 96 },
          { type: 'walker', tx: 116, ty: 11 },
          { type: 'sheller', tx: 141 },
          { type: 'walker', tx: 148 },
          { type: 'walker', tx: 180, ty: 8 }
        ],
        platforms: [
          [47 * TILE, 13 * TILE, 48, 8, 'x', 47 * TILE, 51 * TILE, 0.7],
          [104.5 * TILE, 13 * TILE, 72, 8, 'y', 118, 232, 0.55],
          [151 * TILE, 13 * TILE, 48, 8, 'x', 151 * TILE, 154 * TILE, 0.7]
        ]
      };
    },

    /* New York — midnight avenue. Stoop steps up front, then stacked
     * alley towers to climb, with hoodlums loitering on the ledges. */
    nyc: function () {
      var coins = [];
      dot(coins, 9, 12); dot(coins, 10, 11); dot(coins, 11, 11); dot(coins, 12, 12);
      row(coins, 22, 23, 12);
      dot(coins, 26, 10); dot(coins, 27, 10);
      row(coins, 34, 36, 12);
      row(coins, 38, 40, 10);
      row(coins, 44, 46, 12);
      row(coins, 56, 58, 10); row(coins, 59, 66, 6);
      row(coins, 74, 79, 5); row(coins, 76, 80, 13);
      dot(coins, 86, 10); dot(coins, 88, 8);
      row(coins, 93, 95, 13);
      row(coins, 114, 118, 8); row(coins, 120, 126, 10); row(coins, 128, 134, 12);
      row(coins, 138, 141, 13);
      row(coins, 170, 174, 7); dot(coins, 183, 7); dot(coins, 184, 7);
      return {
        grounds: [[0, 27], [32, 45], [53, 68], [69, 84], [90, 104], [135, 151], [156, 159]],
        blocks: [
          [15, 11, 1, 1, 'brick'], [16, 11, 1, 1, 'q'], [17, 11, 1, 1, 'brick'],
          [18, 11, 1, 1, 'p'],
          [24, 13, 3, 2], [38, 12, 2, 3],
          [40, 11, 1, 1, 'q'], [41, 11, 1, 1, 'brick'], [42, 11, 1, 1, 'q'],
          [56, 11, 2, 1], [58, 9, 2, 1],
          [73, 7, 8, 1],
          [86, 12, 2, 1], [88, 10, 2, 1],
          [98, 11, 1, 1, 'brick'], [99, 11, 1, 1, 'q'], [100, 11, 1, 1, 'brick'],
          [113, 10, 6, 8], [119, 12, 8, 6], [127, 14, 8, 4],
          [144, 11, 1, 1, 'brick'], [145, 11, 1, 1, 'q'], [146, 11, 1, 1, 'brick'],
          [160, 13, 3, 5], [164, 11, 3, 7], [167, 9, 2, 9]
        ],
        coins: coins,
        enemies: [
          { type: 'walker', skin: 'hoodlum', tx: 12 },
          { type: 'sheller', tx: 22 },
          { type: 'walker', skin: 'hoodlum', tx: 36 },
          { type: 'walker', tx: 43 },
          { type: 'walker', skin: 'hoodlum', tx: 57 },
          { type: 'walker', tx: 66 },
          { type: 'sheller', tx: 79 },
          { type: 'walker', tx: 96 },
          { type: 'walker', skin: 'hoodlum', tx: 116, ty: 8 },
          { type: 'sheller', tx: 142 },
          { type: 'walker', tx: 181, ty: 8 }
        ],
        platforms: [
          [47 * TILE, 13 * TILE, 48, 8, 'x', 47 * TILE, 51 * TILE, 0.7],
          [104.5 * TILE, 13 * TILE, 72, 8, 'y', 96, 232, 0.75],
          [151 * TILE, 13 * TILE, 48, 8, 'x', 151 * TILE, 154 * TILE, 0.7]
        ]
      };
    },

    /* İstanbul — dusk over the strait. One long terrace high above the
     * street, patrolled by moustachioed uncles with flat caps. */
    istanbul: function () {
      var coins = [];
      dot(coins, 8, 12); dot(coins, 9, 11); dot(coins, 10, 11); dot(coins, 11, 12);
      row(coins, 24, 25, 13); dot(coins, 28, 10); dot(coins, 29, 10);
      row(coins, 44, 46, 12);
      row(coins, 56, 59, 12); row(coins, 59, 66, 6);
      row(coins, 74, 79, 5); row(coins, 76, 80, 13);
      dot(coins, 86, 10); dot(coins, 88, 8);
      row(coins, 93, 95, 13);
      row(coins, 115, 128, 9);
      row(coins, 138, 141, 13);
      row(coins, 170, 174, 7); dot(coins, 183, 7); dot(coins, 184, 7);
      return {
        grounds: [[0, 29], [34, 46], [53, 68], [69, 84], [90, 104], [135, 151], [156, 159]],
        blocks: [
          [17, 11, 1, 1, 'brick'], [18, 11, 1, 1, 'q'], [19, 11, 1, 1, 'brick'],
          [20, 11, 1, 1, 'p'], [21, 11, 1, 1, 'brick'],
          [26, 13, 2, 2], [28, 12, 2, 3],
          [40, 11, 1, 1, 'q'], [41, 11, 1, 1, 'brick'], [42, 11, 1, 1, 'q'],
          [56, 11, 2, 1],
          [73, 7, 8, 1],
          [86, 12, 2, 1], [88, 10, 2, 1],
          [98, 11, 1, 1, 'brick'], [99, 11, 1, 1, 'q'], [100, 11, 1, 1, 'brick'],
          [113, 11, 20, 7], [133, 13, 2, 5],
          [144, 11, 1, 1, 'brick'], [145, 11, 1, 1, 'q'], [146, 11, 1, 1, 'brick'],
          [160, 13, 3, 5], [163, 11, 3, 7], [166, 9, 3, 9]
        ],
        coins: coins,
        enemies: [
          { type: 'walker', skin: 'uncle', tx: 15 },
          { type: 'sheller', tx: 24 },
          { type: 'walker', skin: 'uncle', tx: 38 },
          { type: 'walker', tx: 57 },
          { type: 'walker', tx: 66 },
          { type: 'sheller', tx: 79 },
          { type: 'walker', skin: 'uncle', tx: 96 },
          { type: 'walker', tx: 118, ty: 10 },
          { type: 'walker', tx: 124, ty: 10 },
          { type: 'sheller', tx: 142 },
          { type: 'walker', tx: 180, ty: 8 }
        ],
        platforms: [
          [47 * TILE, 13 * TILE, 48, 8, 'x', 47 * TILE, 51 * TILE, 0.7],
          [104.5 * TILE, 13 * TILE, 72, 8, 'y', 118, 232, 0.45],
          [151 * TILE, 13 * TILE, 48, 8, 'x', 151 * TILE, 154 * TILE, 0.7]
        ]
      };
    },

    /* Tampa — sunny palms. Low sandy dunes, a slow ferry across the hole
     * in the pavement, grumpy retirees out for a walk. */
    tampa: function () {
      var coins = [];
      dot(coins, 8, 12); dot(coins, 9, 11); dot(coins, 10, 11); dot(coins, 11, 12);
      row(coins, 22, 24, 13); dot(coins, 28, 10); dot(coins, 29, 10);
      row(coins, 44, 46, 12);
      row(coins, 56, 59, 12); row(coins, 60, 66, 6);
      row(coins, 74, 79, 5); row(coins, 76, 80, 13);
      dot(coins, 86, 10); dot(coins, 88, 8);
      row(coins, 93, 95, 13);
      row(coins, 114, 120, 10); row(coins, 122, 127, 12); row(coins, 129, 134, 10);
      row(coins, 138, 141, 13);
      row(coins, 170, 174, 7); dot(coins, 183, 7); dot(coins, 184, 7);
      return {
        grounds: [[0, 30], [33, 47], [53, 68], [69, 84], [90, 104], [135, 151], [156, 159]],
        blocks: [
          [17, 11, 1, 1, 'brick'], [18, 11, 1, 1, 'q'], [19, 11, 1, 1, 'brick'],
          [20, 11, 1, 1, 'p'],
          [26, 13, 2, 2], [28, 12, 2, 3],
          [40, 11, 1, 1, 'q'], [41, 11, 1, 1, 'brick'], [42, 11, 1, 1, 'q'],
          [56, 11, 2, 1], [58, 10, 3, 1],
          [73, 7, 8, 1],
          [86, 12, 2, 1], [88, 10, 2, 1],
          [96, 12, 4, 1],
          [98, 11, 1, 1, 'brick'], [99, 11, 1, 1, 'q'], [100, 11, 1, 1, 'brick'],
          [113, 12, 8, 6], [121, 14, 7, 4], [128, 12, 7, 6],
          [144, 10, 2, 1],
          [160, 13, 3, 5], [164, 11, 3, 7], [167, 9, 2, 9]
        ],
        coins: coins,
        enemies: [
          { type: 'walker', skin: 'grump', tx: 16 },
          { type: 'walker', tx: 23 },
          { type: 'sheller', tx: 39 },
          { type: 'walker', skin: 'grump', tx: 44 },
          { type: 'walker', tx: 57 },
          { type: 'walker', skin: 'grump', tx: 66 },
          { type: 'sheller', tx: 79 },
          { type: 'walker', tx: 98 },
          { type: 'walker', skin: 'grump', tx: 115, ty: 11 },
          { type: 'sheller', tx: 143 },
          { type: 'walker', tx: 181, ty: 8 }
        ],
        platforms: [
          [47 * TILE, 13 * TILE, 48, 8, 'x', 47 * TILE, 51 * TILE, 0.7],
          [104 * TILE, 13 * TILE, 56, 8, 'x', 104 * TILE, 109 * TILE, 0.9],
          [151 * TILE, 13 * TILE, 48, 8, 'x', 151 * TILE, 154 * TILE, 0.7]
        ]
      };
    }
  };

  /* ------------------------------------------------------------------ */
  /* Level construction                                                  */
  /* ------------------------------------------------------------------ */
  function buildLevel(stage) {
    var g = new Uint8Array(LEVEL_W * LEVEL_H);
    function rect(tx, ty, w, h, v) {
      for (var y = ty; y < ty + h; y++) for (var x = tx; x < tx + w; x++) {
        if (x >= 0 && x < LEVEL_W && y >= 0 && y < LEVEL_H) g[y * LEVEL_W + x] = v;
      }
    }
    function ground(x0, x1) { rect(x0, 15, x1 - x0 + 1, 3, T.SOLID); }
    var pick = STAGE_LAYOUTS[stage] ? stage : 'izmir';
    var plan = STAGE_LAYOUTS[pick]();
    for (var gi = 0; gi < plan.grounds.length; gi++) ground(plan.grounds[gi][0], plan.grounds[gi][1]);
    for (var bi = 0; bi < plan.blocks.length; bi++) {
      var b = plan.blocks[bi];
      rect(b[0], b[1], b[2], b[3], KIND[b[4]] || T.SOLID);
    }
    /* the gate tower and the goal plateau are shared anchors, not
     * per-stage terrain: the switch/gate rule and the goal test need them */
    rect(70, 9, 1, 6, T.GATE);
    rect(169, 9, LEVEL_W - 169, 9, T.SOLID);
    var coins = plan.coins.map(function (c) {
      return { x: c[0] * TILE + 3, y: c[1] * TILE + 3, taken: false };
    });
    var enemies = plan.enemies.map(function (e) {
      var tall = e.type === 'sheller' || !!e.skin;
      return {
        type: e.type, skin: e.skin || '',
        x: e.tx * TILE + 1, y: (e.ty != null ? e.ty : 13) * TILE,
        w: 14, h: tall ? 14 : 12,
        vx: -0.45, vy: 0, dir: -1, state: 'walk', timer: 0, dead: false, onGround: false
      };
    });
    return {
      w: LEVEL_W, h: LEVEL_H, tiles: g, stage: pick,
      coins: coins, enemies: enemies,
      switches: [
        { tx: 63, ty: 14, pressed: false },
        { tx: 66, ty: 14, pressed: false }
      ],
      gateTx: 70,
      platforms: plan.platforms.map(function (p) {
        return {
          x: p[0], y: p[1], w: p[2], h: p[3], axis: p[4], min: p[5], max: p[6],
          speed: p[7], dir: 1, dx: 0, dy: 0
        };
      }),
      midpointTx: 92, goalTx: 176, goalTopTy: 9
    };
  }

  /* ------------------------------------------------------------------ */
  /* Game state                                                          */
  /* ------------------------------------------------------------------ */
  function makePlayer(slot, color, tx) {
    return {
      slot: slot, color: color,
      x: tx * TILE + 2, y: 13 * TILE, w: 12, h: 22,
      vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, jbuf: 0, jumpHeld: false,
      hp: 1, big: false, state: 'play', invuln: 0, stateT: 0, squash: 0,
      onPartner: false, onPlatform: null, skid: false, animT: 0, absent: false,
      safeY: 13 * TILE, bubbleX: null, bubbleY: null, carry: false
    };
  }

  // opts: { mode: 'solo'|'local'|'host'|'guest', soloColor: 'red'|'green', twoPlayer: bool }
  function createGame(opts) {
    opts = opts || {};
    var level = buildLevel(opts.stage || 'izmir');
    var two = opts.twoPlayer !== false && opts.mode !== 'solo';
    var players;
    if (opts.mode === 'solo') {
      var c = opts.soloColor === 'green' ? 'green' : 'red';
      var p = makePlayer(c === 'red' ? 0 : 1, c, 3);
      var ghost = makePlayer(c === 'red' ? 1 : 0, c === 'red' ? 'green' : 'red', 5);
      ghost.absent = true; ghost.state = 'absent';
      players = c === 'red' ? [p, ghost] : [ghost, p];
    } else {
      players = [makePlayer(0, 'red', 2), makePlayer(1, 'green', 4)];
    }
    var st = {
      mode: opts.mode || 'local', twoPlayer: two, stage: level.stage,
      tick: 0, tiles: level.tiles, baseTiles: level.tiles.slice(),
      levelW: level.w, levelH: level.h,
      coinsArr: level.coins, enemies: level.enemies,
      switches: level.switches, gateTx: level.gateTx, gateOpen: 0, gateLatched: false,
      platforms: level.platforms,
      midpointTx: level.midpointTx, goalTx: level.goalTx, goalTopTy: level.goalTopTy,
      midReached: false, checkpoint: { x: 2 * TILE, y: 13 * TILE },
      players: players,
      berries: [], coinCount: 0, score: 0,
      lives: 3, gameOver: false, respawnAt: 0,
      timeLeft: 300 * 60, finished: false, finishTick: 0,
      runTicks: 0,
      camX: 0, events: [], tileDiff: {},
      rng: 12345
    };
    /* settle authored spawns once so tick 0 is already clear of terrain */
    for (var ei = 0; ei < st.enemies.length; ei++) unbury(st, st.enemies[ei]);
    return st;
  }

  /* True when the AABB overlaps any solid tile. Used as a safety net so
   * a player can never end up buried inside terrain (which made them
   * vanish behind the tiles when the camera tether shoved them). */
  function blockedBox(st, x, y, w, h) {
    if (!isFinite(x) || !isFinite(y)) return true;
    var tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + w - 0.01) / TILE);
    var ty0 = Math.floor(y / TILE), ty1 = Math.floor((y + h - 0.01) / TILE);
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        if (solidAt(st, tx, ty)) return true;
      }
    }
    return false;
  }

  /* Place an entity at (x,y), clamped inside the level and lifted out of
   * any terrain it would otherwise overlap. */
  function safePlace(st, p, x, y) {
    if (!isFinite(x)) x = st.checkpoint.x;
    if (!isFinite(y)) y = st.checkpoint.y;
    var maxX = st.levelW * TILE - p.w;
    if (x < 0) x = 0;
    if (x > maxX) x = maxX;
    if (y > st.levelH * TILE) y = st.checkpoint.y;
    for (var i = 0; i < 12 && blockedBox(st, x, y, p.w, p.h); i++) y -= TILE;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0;
  }

  /* Lift an entity that is inside terrain up to the nearest free row.
   * An authored spawn can land in a solid block (the high terrace used to
   * swallow two critters), and a moving platform can shove one into a
   * wall; buried critters are invisible and unkillable, so they are
   * recovered instead of being left to patrol inside the level. */
  function unbury(st, p) {
    if (!blockedBox(st, p.x, p.y, p.w, p.h)) return false;
    for (var i = 0; i < st.levelH && blockedBox(st, p.x, p.y, p.w, p.h); i++) p.y -= TILE;
    p.vy = 0;
    return true;
  }

  function tileAt(st, tx, ty) {
    if (tx < 0) return T.SOLID;
    if (tx >= st.levelW) return T.SOLID;
    if (ty < 0) return T.EMPTY;
    if (ty >= st.levelH) return T.EMPTY;
    var v = st.tiles[ty * st.levelW + tx];
    if (v === T.GATE && st.gateOpen >= 0.95) return T.EMPTY;
    return v;
  }
  function solidAt(st, tx, ty) { var v = tileAt(st, tx, ty); return v !== T.EMPTY; }
  function setTile(st, tx, ty, v) {
    st.tiles[ty * st.levelW + tx] = v;
    st.tileDiff[ty * st.levelW + tx] = v;
  }
  function ev(st, s) { st.events.push(s); }

  /* AABB vs tile grid movement, axis separated. ent: {x,y,w,h,vx,vy} */
  function moveCollide(st, e, isPlayer) {
    var bumpedTile = null;
    // X axis
    e.x += e.vx;
    var ty0 = Math.floor(e.y / TILE), ty1 = Math.floor((e.y + e.h - 0.01) / TILE);
    if (e.vx > 0) {
      var tx = Math.floor((e.x + e.w) / TILE);
      for (var ty = ty0; ty <= ty1; ty++) if (solidAt(st, tx, ty)) {
        e.x = tx * TILE - e.w - 0.01; e.vx = 0; e.hitWall = 1; break;
      }
    } else if (e.vx < 0) {
      tx = Math.floor(e.x / TILE);
      for (ty = ty0; ty <= ty1; ty++) if (solidAt(st, tx, ty)) {
        e.x = (tx + 1) * TILE + 0.01; e.vx = 0; e.hitWall = -1; break;
      }
    }
    // Y axis
    e.y += e.vy;
    var tx0 = Math.floor(e.x / TILE), tx1 = Math.floor((e.x + e.w - 0.01) / TILE);
    e.onGround = false;
    if (e.vy > 0) {
      var by = Math.floor((e.y + e.h) / TILE);
      for (var bx = tx0; bx <= tx1; bx++) if (solidAt(st, bx, by)) {
        e.y = by * TILE - e.h; e.vy = 0; e.onGround = true; break;
      }
    } else if (e.vy < 0) {
      by = Math.floor(e.y / TILE);
      for (bx = tx0; bx <= tx1; bx++) if (solidAt(st, bx, by)) {
        e.y = (by + 1) * TILE + 0.01; e.vy = 0;
        bumpedTile = { tx: bx, ty: by };
        break;
      }
    }
    return bumpedTile;
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ------------------------------------------------------------------ */
  /* Player step                                                         */
  /* ------------------------------------------------------------------ */
  var EMPTY_INPUT = { l: false, r: false, u: false, d: false, run: false };

  /* A player who runs out of hearts is "down". Solo loses a life straight
   * away (no bubble); co-op puts them in a bubble for the partner to pop.
   * If both partners are down at the same time the team loses a life and
   * both restart at the checkpoint, like a classic platformer. */
  function downPlayer(st, p) {
    if (st.gameOver || p.state === 'ko' || p.state === 'bubble') return;
    if (!st.twoPlayer) { loseLife(st); return; }
    var partnerDown = false;
    for (var i = 0; i < st.players.length; i++) {
      var q = st.players[i];
      if (q !== p && !q.absent && q.state === 'bubble') partnerDown = true;
    }
    if (partnerDown || !hasPartner(st, p)) { loseLife(st); return; }
    p.state = 'bubble'; p.stateT = 0; p.vx = 0; p.vy = 0;
    p.big = false; p.hp = 1; p.stuck = 0; p.onPartner = false; p.onPlatform = null;
    /* It hovers where they went down, lifted clear of the floor, and stays
     * there. It must NOT drift into the partner on its own: the rescue has
     * to be a deliberate touch, and the bubble is a real state the team can
     * lose a life while sitting in. */
    /* Anchor to the last spot they stood on, so a pit death leaves the
     * bubble floating above the hole instead of buried in the floor. */
    var anchorY = (typeof p.safeY === 'number' && p.y > p.safeY) ? p.safeY : p.y;
    p.bubbleX = Math.max(10, Math.min(st.levelW * TILE - 10, p.x + p.w / 2));
    p.bubbleY = Math.max(22, anchorY - 26);
    ev(st, 'out');
  }

  function hasPartner(st, p) {
    for (var i = 0; i < st.players.length; i++) {
      var q = st.players[i];
      if (q !== p && !q.absent) return true;
    }
    return false;
  }

  /* Catch-up sweep: a partner left far behind and off the left edge is
   * lifted into a carry bubble and flown to whoever is in front. It costs
   * no life and keeps whatever power state they had — it exists so nobody
   * can be stranded off-screen or drag the camera back onto the leader. */
  function sweepStraggler(st) {
    if (!st.twoPlayer || st.finished || st.gameOver || st.respawnAt) return;
    var lead = null;
    for (var i = 0; i < st.players.length; i++) {
      var p = st.players[i];
      if (p.absent || p.state !== 'play') continue;
      if (!lead || p.x > lead.x) lead = p;
    }
    if (!lead) return;
    for (var j = 0; j < st.players.length; j++) {
      var q = st.players[j];
      if (q === lead || q.absent || q.state !== 'play') continue;
      if (lead.x - q.x < CARRY_GAP) continue;
      if (q.x + q.w > st.camX + 6) continue;          // still on screen
      q.state = 'bubble'; q.stateT = 0; q.carry = true; q.vx = 0; q.vy = 0;
      q.stuck = 0; q.onPartner = false; q.onPlatform = null;
      q.bubbleX = q.x + q.w / 2;
      q.bubbleY = Math.max(22, (typeof q.safeY === 'number' ? q.safeY : q.y) - 26);
      ev(st, 'out');
    }
  }

  /* Team life loss: freeze everyone briefly, then respawn at the checkpoint. */
  function loseLife(st) {
    if (st.gameOver || st.respawnAt) return;
    st.lives = Math.max(0, st.lives - 1);
    for (var i = 0; i < st.players.length; i++) {
      var p = st.players[i];
      if (p.absent) continue;
      p.state = 'ko'; p.stateT = 0; p.vx = 0; p.vy = 0;
      p.hp = 1; p.big = false; p.onPartner = false; p.onPlatform = null; p.stuck = 0;
      p.bubbleX = p.bubbleY = null; p.carry = false;
      /* pop out of view where they last stood, so a pit death doesn't
       * animate invisibly under the level */
      if (typeof p.safeY === 'number' && p.y > p.safeY) p.y = p.safeY;
    }
    ev(st, 'lifeloss');
    if (st.lives <= 0) {
      st.gameOver = true;
      ev(st, 'gameover');
    } else {
      st.respawnAt = st.tick + 45;
    }
  }

  function respawnPlayers(st) {
    st.respawnAt = 0;
    for (var i = 0; i < st.players.length; i++) {
      var p = st.players[i];
      if (p.absent) continue;
      p.state = 'play'; p.hp = 1; p.big = false; p.invuln = 140;
      p.stateT = 0; p.stuck = 0; p.onPartner = false; p.onPlatform = null;
      p.bubbleX = p.bubbleY = null; p.carry = false;
      safePlace(st, p, st.checkpoint.x + i * 26, st.checkpoint.y - 10);
    }
    var maxCam = st.levelW * TILE - VIEW_W;
    var c = st.checkpoint.x - VIEW_W / 2;
    if (c < 0) c = 0;
    if (c > maxCam) c = maxCam;
    st.camX = c;
  }

  function hurtPlayer(st, p, fromX) {
    if (p.state !== 'play' || p.invuln > 0) return;
    if (p.big) {
      p.big = false; p.hp = 1; p.invuln = 130;
      p.vx = (p.x + p.w / 2 < fromX ? -1.6 : 1.6); p.vy = -3.4;
      ev(st, 'shrink');
    } else {
      downPlayer(st, p);
    }
  }

  function stepPlayer(st, p, input, partner) {
    if (p.absent || p.state === 'absent' || p.state === 'ko') return;
    p.animT++;
    if (p.invuln > 0) p.invuln--;
    if (p.squash > 0) p.squash--;

    if (p.state === 'bubble') {
      p.stateT++;
      /* being carried to the partner: a short guided flight, then it pops */
      if (p.carry) {
        var host = (partner && !partner.absent && partner.state === 'play') ? partner : null;
        if (!host) {
          p.carry = false;                       // leader gone: wait to be rescued
        } else {
          var hx = host.x + host.w / 2, hy = host.y + host.h / 2 - 10;
          var dx = hx - (p.x + p.w / 2), dy = hy - (p.y + p.h / 2);
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var spd = Math.min(9, 3.2 + p.stateT * 0.14);   // eases in, then catches up
          p.x += (dx / dist) * spd + Math.sin(p.stateT * 0.16) * 0.2;
          p.y += (dy / dist) * spd + Math.cos(p.stateT * 0.13) * 0.2;
          if (dist < 26) {
            p.state = 'play'; p.carry = false; p.invuln = 140; p.vx = 0; p.vy = 0;
            safePlace(st, p, host.x - p.w / 2, host.y);
            ev(st, 'pop');
          }
          return;
        }
      }
      if (p.bubbleX == null || p.bubbleY == null) {
        p.bubbleX = p.x + p.w / 2;
        p.bubbleY = Math.max(22, p.y - 26);
      }
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      // bobbing hover around the spot where they went down
      p.x += (p.bubbleX - cx) * 0.06 + Math.sin(p.stateT * 0.07) * 0.25;
      p.y += (p.bubbleY - cy) * 0.06 + Math.cos(p.stateT * 0.05) * 0.2;
      // the partner pops it by jumping into it
      if (partner && !partner.absent && partner.state === 'play' && p.stateT > 18 && overlap(p, partner)) {
        p.state = 'play'; p.carry = false; p.invuln = 130; p.vy = 0; p.vx = 0;
        safePlace(st, p, partner.x, partner.y - p.h - 1);
        ev(st, 'pop');
      } else if ((!partner || partner.absent || partner.state !== 'play') && p.stateT > 420) {
        // nobody left to rescue them: back to the checkpoint
        p.state = 'play'; p.invuln = 130;
        safePlace(st, p, st.checkpoint.x, st.checkpoint.y);
        p.bubbleX = p.bubbleY = null;
        ev(st, 'pop');
      }
      return;
    }
    p.bubbleX = p.bubbleY = null;

    /* --- platform carry --- */
    if (p.onPlatform) { p.x += p.onPlatform.dx; p.y += p.onPlatform.dy; }
    p.onPlatform = null;

    /* --- partner carry (standing on head) --- */
    if (p.onPartner && partner && partner.state === 'play') {
      p.x += partner.vx * 0 + (partner.x - (p._lastPartnerX != null ? p._lastPartnerX : partner.x));
    }
    if (partner) p._lastPartnerX = partner.x;

    /* --- horizontal movement --- */
    var maxSp = input.run ? 2.7 : 1.7;
    var accel = p.onGround ? 0.32 : 0.22;
    p.skid = false;
    if (input.l && !input.r) {
      if (p.vx > 0.4 && p.onGround) { p.vx -= 0.55; p.skid = p.vx > 1.4; }
      else p.vx -= accel;
      p.face = -1;
    } else if (input.r && !input.l) {
      if (p.vx < -0.4 && p.onGround) { p.vx += 0.55; p.skid = p.vx < -1.4; }
      else p.vx += accel;
      p.face = 1;
    } else if (p.onGround) {
      if (p.vx > 0) p.vx = Math.max(0, p.vx - 0.3);
      else if (p.vx < 0) p.vx = Math.min(0, p.vx + 0.3);
    }
    if (p.vx > maxSp) p.vx = Math.max(maxSp, p.vx - 0.3);
    if (p.vx < -maxSp) p.vx = Math.min(-maxSp, p.vx + 0.3);

    /* --- jumping --- */
    if (input.u) { if (!p.jumpHeld) p.jbuf = 6; p.jumpHeld = true; }
    else p.jumpHeld = false;
    if (p.jbuf > 0) p.jbuf--;
    if (p.onGround) p.coyote = 6; else if (p.coyote > 0) p.coyote--;
    if (p.jbuf > 0 && (p.onGround || p.coyote > 0 || p.onPartner)) {
      var boost = p.onPartner ? 1.22 : 1.0;      // head-bounce boost
      p.vy = -7.6 * boost;
      p.jbuf = 0; p.coyote = 0; p.onGround = false; p.onPartner = false;
      ev(st, 'jump');
    }
    var grav = (p.vy < 0 && input.u) ? 0.30 : 0.44;
    p.vy += grav;
    if (p.vy > 7.5) p.vy = 7.5;

    var wasGround = p.onGround;
    var bumped = moveCollide(st, p, true);
    if (bumped) bumpTile(st, p, bumped);
    if (p.onGround && !wasGround && p._fallV > 4) ev(st, 'land');
    p._fallV = p.vy;
    if (p.onGround && !blockedBox(st, p.x, p.y, p.w, p.h)) p.safeY = p.y;

    /* never stay buried in terrain: nudge out, and if that fails lift
     * the player to the nearest free spot above */
    if (blockedBox(st, p.x, p.y, p.w, p.h)) {
      p.stuck = (p.stuck || 0) + 1;
      if (p.stuck > 6) { safePlace(st, p, p.x, p.y - 1); p.stuck = 0; }
    } else p.stuck = 0;

    /* --- moving platforms: land on top --- */
    for (var i = 0; i < st.platforms.length; i++) {
      var pl = st.platforms[i];
      var prevBottom = p.y + p.h - p.vy;
      if (p.vy >= 0 && p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2 &&
          prevBottom <= pl.y + 6 && p.y + p.h >= pl.y && p.y + p.h <= pl.y + 14) {
        p.y = pl.y - p.h; p.vy = 0; p.onGround = true; p.onPlatform = pl;
      }
    }

    /* --- pit fall --- */
    if (p.y > st.levelH * TILE + 24) { downPlayer(st, p); return; }

    /* --- coins --- */
    for (var ci = 0; ci < st.coinsArr.length; ci++) {
      var c = st.coinsArr[ci];
      if (!c.taken && overlap(p, { x: c.x, y: c.y, w: 10, h: 10 })) {
        c.taken = true; st.coinCount++; st.score += 50; ev(st, 'coin');
      }
    }
    /* --- berries (growth) --- */
    for (var bi = st.berries.length - 1; bi >= 0; bi--) {
      var b = st.berries[bi];
      if (overlap(p, b)) {
        p.big = true; p.hp = 2; st.score += 500; ev(st, 'power');
        st.berries.splice(bi, 1);
      }
    }
    /* --- midpoint + goal --- */
    if (!st.midReached && p.x > st.midpointTx * TILE) {
      st.midReached = true;
      st.checkpoint = { x: st.midpointTx * TILE, y: 13 * TILE };
      ev(st, 'mid');
    }
    if (!st.finished && p.x + p.w > st.goalTx * TILE && p.y < (st.goalTopTy + 3) * TILE) {
      st.finished = true; st.finishTick = st.tick; st.score += 1000; ev(st, 'goal');
    }
  }

  function bumpTile(st, p, bt) {
    var v = tileAt(st, bt.tx, bt.ty);
    if (v === T.QBLOCK) {
      setTile(st, bt.tx, bt.ty, T.USED);
      st.coinCount++; st.score += 50; ev(st, 'coin');
    } else if (v === T.PBLOCK) {
      setTile(st, bt.tx, bt.ty, T.USED);
      st.berries.push({ x: bt.tx * TILE + 1, y: bt.ty * TILE - 14, w: 14, h: 12, vx: 0.7, vy: -1.2 });
      ev(st, 'sprout');
    } else if (v === T.BRICK) {
      if (p.big) { setTile(st, bt.tx, bt.ty, T.EMPTY); st.score += 30; ev(st, 'break'); }
      else ev(st, 'bump');
    } else if (v === T.SOLID || v === T.USED || v === T.GATE) {
      ev(st, 'bump');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Enemies + berries                                                   */
  /* ------------------------------------------------------------------ */
  function stepEnemy(st, e) {
    if (e.dead) return;
    unbury(st, e);
    if (e.state === 'shell') {
      e.timer++;
      e.vx = 0;
      e.vy += 0.4; if (e.vy > 7) e.vy = 7;
      moveCollide(st, e, false);
      if (e.timer > 480) { e.state = 'walk'; e.h = e.type === 'walker' ? 12 : 14; }
      return;
    }
    if (e.state === 'slide') {
      e.vy += 0.4; if (e.vy > 7) e.vy = 7;
      var oldVx = e.vx;
      moveCollide(st, e, false);
      if (e.hitWall) { e.vx = -oldVx; e.dir = -e.dir; ev(st, 'kick'); }
      e.hitWall = 0;
      // sliding shell defeats other enemies
      for (var i = 0; i < st.enemies.length; i++) {
        var o = st.enemies[i];
        if (o !== e && !o.dead && overlap(e, o)) { o.dead = true; st.score += 100; ev(st, 'stomp'); }
      }
      if (e.y > st.levelH * TILE + 40) e.dead = true;
      return;
    }
    // walking
    e.vy += 0.4; if (e.vy > 7) e.vy = 7;
    var spd = e.type === 'walker' ? 0.45 : 0.4;
    e.vx = e.dir * spd;
    moveCollide(st, e, false);
    if (e.hitWall) { e.dir = -e.dir; e.hitWall = 0; }
    if (e.onGround) {
      var aheadX = e.dir > 0 ? Math.floor((e.x + e.w + 2) / TILE) : Math.floor((e.x - 2) / TILE);
      var belowY = Math.floor((e.y + e.h + 2) / TILE);
      if (!solidAt(st, aheadX, belowY)) e.dir = -e.dir;   // turn at ledges
    }
    if (e.y > st.levelH * TILE + 40) e.dead = true;
  }

  function stepBerry(st, b) {
    b.vy += 0.25; if (b.vy > 5) b.vy = 5;
    moveCollide(st, b, false);
    if (b.hitWall) { b.vx = -b.vx; b.hitWall = 0; }
  }

  /* ------------------------------------------------------------------ */
  /* Player vs enemy + player vs player                                  */
  /* ------------------------------------------------------------------ */
  function interact(st) {
    var ps = st.players;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.absent || p.state !== 'play') continue;
      for (var j = 0; j < st.enemies.length; j++) {
        var e = st.enemies[j];
        if (e.dead || !overlap(p, e)) continue;
        var stomp = p.vy > 0.4 && (p.y + p.h - e.y) < e.h * 0.65;
        if (e.state === 'shell') {
          // kick it away from the player
          var dir = (e.x + e.w / 2 < p.x + p.w / 2) ? -1 : 1;
          e.state = 'slide'; e.vx = dir * 3.3; e.dir = dir; e.timer = 0;
          if (stomp) p.vy = -4.5;
          ev(st, 'kick');
        } else if (stomp) {
          if (e.state === 'slide') { e.state = 'shell'; e.timer = 0; e.vx = 0; }
          else if (e.type === 'walker') { e.dead = true; st.score += 100; }
          else { e.state = 'shell'; e.timer = 0; e.h = 10; e.y += 4; }
          p.vy = p.jumpHeld ? -7.4 : -4.8;
          ev(st, 'stomp');
        } else if (e.state !== 'slide') {
          hurtPlayer(st, p, e.x + e.w / 2);
        }
      }
    }
    // partner interactions: head-stand / head-bounce
    if (ps.length === 2 && !ps[0].absent && !ps[1].absent) {
      for (var a = 0; a < 2; a++) {
        var A = ps[a], B = ps[1 - a];
        A.onPartner = false;
        if (A.state === 'play' && B.state === 'play') {
          var footY = A.y + A.h;
          var horiz = A.x + A.w > B.x + 1 && A.x < B.x + B.w - 1;
          if (horiz && A.vy >= 0 && footY >= B.y - 1 && footY <= B.y + 9 && A.y < B.y) {
            if (A.vy > 4.4) { // bouncy landing on a head
              A.vy = -5.4; B.squash = 10; ev(st, 'boing');
            } else if (!blockedBox(st, A.x, B.y - A.h, A.w, A.h)) {
              A.y = B.y - A.h; A.vy = 0; A.onGround = true; A.onPartner = true;
            }
          }
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Switches / gate / platforms / camera                                */
  /* ------------------------------------------------------------------ */
  function stepWorld(st) {
    // platforms
    for (var i = 0; i < st.platforms.length; i++) {
      var pl = st.platforms[i], oldX = pl.x, oldY = pl.y;
      if (pl.axis === 'x') {
        pl.x += pl.speed * pl.dir;
        if (pl.x > pl.max) { pl.x = pl.max; pl.dir = -1; }
        if (pl.x < pl.min) { pl.x = pl.min; pl.dir = 1; }
      } else {
        pl.y += pl.speed * pl.dir;
        if (pl.y > pl.max) { pl.y = pl.max; pl.dir = -1; }
        if (pl.y < pl.min) { pl.y = pl.min; pl.dir = 1; }
      }
      pl.dx = pl.x - oldX; pl.dy = pl.y - oldY;
    }
    // switches
    var pressedCount = 0;
    for (var s = 0; s < st.switches.length; s++) {
      var sw = st.switches[s];
      sw.pressed = false;
      var plate = { x: sw.tx * TILE, y: sw.ty * TILE + 10, w: TILE, h: 6 };
      for (var pi = 0; pi < st.players.length; pi++) {
        var p = st.players[pi];
        if (p.absent || p.state !== 'play') continue;
        var feet = { x: p.x, y: p.y + p.h - 6, w: p.w, h: 6 };
        if (overlap(feet, plate) && p.onGround) sw.pressed = true;
      }
      if (sw.pressed) pressedCount++;
    }
    var need = st.twoPlayer ? 2 : 1;
    if (!st.gateLatched && pressedCount >= need) {
      st.gateLatched = true; ev(st, 'gate');
    }
    if (st.gateLatched && st.gateOpen < 1) st.gateOpen = Math.min(1, st.gateOpen + 0.02);

    // timer (paused during the short out-of-lives/respawn freeze)
    if (!st.finished && !st.respawnAt && !st.gameOver && st.timeLeft > 0) {
      st.timeLeft--;
      if (st.timeLeft === 0) {
        ev(st, 'timeout');
        st.timeLeft = 300 * 60;
        loseLife(st);
      }
    }
    // camera: frame both active players, but when they split up follow the
    // one in front — averaging a straggler back into view is what used to
    // drag the leader into terrain and crush them on screen
    var xs = [];
    for (var ci = 0; ci < st.players.length; ci++) {
      var cp = st.players[ci];
      if (!cp.absent && cp.state === 'play') xs.push(cp.x + cp.w / 2);
    }
    if (xs.length) {
      var lead = Math.max.apply(null, xs), tail = Math.min.apply(null, xs);
      var split = xs.length > 1 && lead - tail > SPLIT_FOLLOW;
      var mid = split ? lead : xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
      var target = mid - VIEW_W / 2;
      var maxCam = st.levelW * TILE - VIEW_W;
      if (target < 0) target = 0; if (target > maxCam) target = maxCam;
      st.camX += (target - st.camX) * 0.12;
      /* Keep everyone inside the level itself. The old camera tether that
       * dragged players to the view edge is gone: it could shove them into
       * terrain, and a partner left behind is now flown forward in a carry
       * bubble instead of being yanked through the floor. */
      for (var ti = 0; ti < st.players.length; ti++) {
        var tp = st.players[ti];
        if (tp.absent || tp.state !== 'play') continue;
        if (tp.x < 0) tp.x = 0;
        var maxX = st.levelW * TILE - tp.w;
        if (tp.x > maxX) tp.x = maxX;
      }
    }

    sweepStraggler(st);
  }

  /* ------------------------------------------------------------------ */
  /* Main step                                                           */
  /* ------------------------------------------------------------------ */
  function step(st, inputs) {
    st.events.length = 0;
    if (st.finished || st.gameOver) { st.tick++; return; }
    /* active play time, used by the end-of-run summary (does not run once
     * the stage is over, so it is the elapsed time of the run) */
    st.runTicks = (st.runTicks || 0) + 1;
    if (st.respawnAt && st.tick >= st.respawnAt) respawnPlayers(st);
    stepWorld(st);
    if (st.gameOver) { st.tick++; return; }
    for (var i = 0; i < st.enemies.length; i++) stepEnemy(st, st.enemies[i]);
    for (var b = st.berries.length - 1; b >= 0; b--) {
      stepBerry(st, st.berries[b]);
      if (st.berries[b].y > st.levelH * TILE + 40) st.berries.splice(b, 1);
    }
    var in0 = (inputs && inputs[0]) || EMPTY_INPUT;
    var in1 = (inputs && inputs[1]) || EMPTY_INPUT;
    stepPlayer(st, st.players[0], st.players[0].slot === 0 ? in0 : in1, st.players[1]);
    stepPlayer(st, st.players[1], st.players[1].slot === 1 ? in1 : in0, st.players[0]);
    interact(st);
    sanitize(st);
    st.tick++;
  }

  /* Inputs are indexed by SLOT: inputs[0] drives the red-slot player,   */
  /* inputs[1] drives the green-slot player. stepPlayer above receives   */
  /* per-player inputs resolved by main; to keep this simple, main must  */
  /* pass inputs already mapped per players[] order. We handle it here:  */
  function stepMapped(st, inputsBySlot) {
    // players[] order is always [slot0, slot1] except solo-green; resolve:
    var per = st.players.map(function (p) { return inputsBySlot[p.slot] || EMPTY_INPUT; });
    step(st, per);
  }

  /* Last-resort guard: a non-finite position would make the 3D model
   * disappear forever, so recover immediately at the checkpoint. */
  function sanitize(st) {
    for (var i = 0; i < st.players.length; i++) {
      var p = st.players[i];
      if (p.absent) continue;
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.vx) || !isFinite(p.vy)) {
        p.state = 'play'; p.invuln = 120; p.stuck = 0;
        safePlace(st, p, st.checkpoint.x, st.checkpoint.y);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Snapshots (netplay)                                                 */
  /* ------------------------------------------------------------------ */
  function round1(v) { return Math.round(v * 10) / 10; }
  function makeSnapshot(st) {
    return {
      tick: st.tick, camX: round1(st.camX), coins: st.coinCount, score: st.score,
      timeLeft: st.timeLeft, finished: st.finished, mid: st.midReached,
      lives: st.lives, over: st.gameOver ? 1 : 0, runTicks: st.runTicks || 0,
      gateOpen: round1(st.gateOpen * 100) / 100, gateLatched: st.gateLatched,
      switches: st.switches.map(function (s) { return s.pressed ? 1 : 0; }),
      players: st.players.map(function (p) {
        return [round1(p.x), round1(p.y), round1(p.vx), round1(p.vy), p.face,
                p.big ? 1 : 0, p.state, p.invuln > 0 ? 1 : 0, p.squash > 0 ? 1 : 0, p.absent ? 1 : 0, p.skid ? 1 : 0];
      }),
      enemies: st.enemies.map(function (e) {
        return [round1(e.x), round1(e.y), e.state, e.dir, e.dead ? 1 : 0];
      }),
      platforms: st.platforms.map(function (pl) { return [round1(pl.x), round1(pl.y)]; }),
      berries: st.berries.map(function (b) { return [round1(b.x), round1(b.y)]; }),
      coinsTaken: st.coinsArr.map(function (c) { return c.taken ? '1' : '0'; }).join(''),
      tileDiff: st.tileDiff
    };
  }
  function applySnapshot(st, s) {
    st.tick = s.tick; st.camX = s.camX; st.coinCount = s.coins; st.score = s.score;
    st.timeLeft = s.timeLeft; st.finished = s.finished; st.midReached = s.mid;
    if (typeof s.lives === 'number') st.lives = s.lives;
    st.runTicks = typeof s.runTicks === 'number' ? s.runTicks : 0;
    st.gameOver = !!s.over;
    st.gateOpen = s.gateOpen; st.gateLatched = s.gateLatched;
    s.switches.forEach(function (v, i) { st.switches[i].pressed = !!v; });
    s.players.forEach(function (a, i) {
      var p = st.players[i]; if (!p) return;
      if (!isFinite(a[0]) || !isFinite(a[1])) return;   // ignore corrupt snapshot rows
      p.x = a[0]; p.y = a[1]; p.vx = a[2]; p.vy = a[3]; p.face = a[4];
      p.big = !!a[5]; p.state = a[6]; p.invuln = a[7] ? 10 : 0; p.squash = a[8] ? 5 : 0;
      p.absent = !!a[9]; p.skid = !!a[10]; p.animT++;
    });
    s.enemies.forEach(function (a, i) {
      var e = st.enemies[i]; if (!e) return;
      e.x = a[0]; e.y = a[1]; e.state = a[2]; e.dir = a[3]; e.dead = !!a[4];
    });
    s.platforms.forEach(function (a, i) {
      var pl = st.platforms[i]; if (!pl) return;
      pl.dx = a[0] - pl.x; pl.dy = a[1] - pl.y; pl.x = a[0]; pl.y = a[1];
    });
    st.berries = s.berries.map(function (a) {
      return { x: a[0], y: a[1], w: 14, h: 12, vx: 0, vy: 0 };
    });
    for (var i = 0; i < st.coinsArr.length; i++) {
      st.coinsArr[i].taken = s.coinsTaken.charAt(i) === '1';
    }
    st.tiles.set(st.baseTiles);
    st.tileDiff = {};
    for (var k in s.tileDiff) { st.tiles[k] = s.tileDiff[k]; st.tileDiff[k] = s.tileDiff[k]; }
    if (s.mid) st.checkpoint = { x: st.midpointTx * TILE, y: 13 * TILE };
  }

  var Engine = {
    TILE: TILE, VIEW_W: VIEW_W, VIEW_H: VIEW_H, T: T,
    createGame: createGame, step: stepMapped, makeSnapshot: makeSnapshot,
    applySnapshot: applySnapshot, buildLevel: buildLevel,
    EMPTY_INPUT: EMPTY_INPUT
  };
  global.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
