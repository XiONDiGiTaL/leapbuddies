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

  /* ------------------------------------------------------------------ */
  /* Level construction (all layout is original, built from helpers)     */
  /* ------------------------------------------------------------------ */
  function buildLevel() {
    var g = new Uint8Array(LEVEL_W * LEVEL_H);
    function rect(tx, ty, w, h, v) {
      for (var y = ty; y < ty + h; y++) for (var x = tx; x < tx + w; x++) {
        if (x >= 0 && x < LEVEL_W && y >= 0 && y < LEVEL_H) g[y * LEVEL_W + x] = v;
      }
    }
    function ground(x0, x1) { rect(x0, 15, x1 - x0 + 1, 3, T.SOLID); }

    ground(0, 29);            // A: start meadow
    ground(34, 47);           // B
    ground(53, 68);           // C: switch field
    ground(69, 84);           // D: beyond the gate
    ground(90, 104);          // E: midpoint flats
    rect(113, 11, 20, 7, T.SOLID); // F: high terrace (top row 11)
    rect(133, 13, 2, 5, T.SOLID);  // step down
    ground(135, 151);         // G: sprint flats
    ground(156, 159);         // G2 landing
    rect(160, 13, 3, 5, T.SOLID);  // climb steps
    rect(163, 11, 3, 7, T.SOLID);
    rect(166, 9, 3, 9, T.SOLID);
    rect(169, 9, 31, 9, T.SOLID);  // goal plateau (top row 9)

    // gate tower at x=70 (rows 9..14), blocks the walkway on segment D
    rect(70, 9, 1, 6, T.GATE);

    // start-area blocks
    rect(17, 11, 1, 1, T.BRICK); rect(18, 11, 1, 1, T.QBLOCK);
    rect(19, 11, 1, 1, T.BRICK); rect(20, 11, 1, 1, T.PBLOCK);
    rect(21, 11, 1, 1, T.BRICK);
    // start columns
    rect(26, 13, 2, 2, T.SOLID); rect(28, 12, 2, 3, T.SOLID);
    // B blocks
    rect(40, 11, 1, 1, T.QBLOCK); rect(41, 11, 1, 1, T.BRICK); rect(42, 11, 1, 1, T.QBLOCK);
    // C: step block + co-op bonus ledge (needs a partner head-bounce)
    rect(56, 11, 2, 1, T.SOLID);
    rect(73, 7, 8, 1, T.SOLID);
    // E blocks
    rect(98, 11, 1, 1, T.BRICK); rect(99, 11, 1, 1, T.QBLOCK); rect(100, 11, 1, 1, T.BRICK);
    // stepping blocks over the pit between D and E
    rect(86, 12, 2, 1, T.SOLID); rect(88, 10, 2, 1, T.SOLID);
    // G blocks
    rect(144, 11, 1, 1, T.BRICK); rect(145, 11, 1, 1, T.QBLOCK); rect(146, 11, 1, 1, T.BRICK);

    var coins = [];
    function coin(tx, ty) { coins.push({ x: tx * TILE + 3, y: ty * TILE + 3, taken: false }); }
    function coinRow(x0, x1, ty) { for (var x = x0; x <= x1; x++) coin(x, ty); }
    coin(8, 12); coin(9, 11); coin(10, 11); coin(11, 12);      // start arc
    coinRow(24, 25, 13); coin(28, 10); coin(29, 10);
    coinRow(44, 46, 12);
    coinRow(56, 59, 12); coinRow(59, 66, 6);                    // ledge coins
    coinRow(74, 79, 5);                                          // co-op ledge coins
    coinRow(76, 80, 13);
    coin(86, 10); coin(88, 8);
    coinRow(93, 95, 13);
    coinRow(115, 128, 8);                                        // terrace coins (some)
    coins = coins.filter(function (c, i) { return i % 1 === 0; });
    coinRow(138, 141, 13);
    coinRow(170, 174, 7);
    coin(183, 7); coin(184, 7);

    var enemies = [
      { type: 'walker', tx: 14 }, { type: 'sheller', tx: 38 },
      { type: 'walker', tx: 57 }, { type: 'walker', tx: 78 },
      { type: 'sheller', tx: 96 }, { type: 'walker', tx: 118 },
      { type: 'walker', tx: 124 }, { type: 'sheller', tx: 142 },
      { type: 'walker', tx: 148 }, { type: 'walker', tx: 180, ty: 8 }
    ].map(function (e) {
      return {
        type: e.type, x: e.tx * TILE + 1, y: ((e.ty != null ? e.ty : 13)) * TILE,
        w: 14, h: e.type === 'walker' ? 12 : 14,
        vx: -0.45, vy: 0, dir: -1, state: 'walk', timer: 0, dead: false, onGround: false
      };
    });

    return {
      w: LEVEL_W, h: LEVEL_H, tiles: g,
      coins: coins, enemies: enemies,
      switches: [{ tx: 63, ty: 14, pressed: false }, { tx: 66, ty: 14, pressed: false }],
      gateTx: 70,
      platforms: [
        { x: 47 * TILE, y: 13 * TILE, w: 48, h: 8, axis: 'x', min: 47 * TILE, max: 51 * TILE, speed: 0.7, dir: 1, dx: 0, dy: 0 },
        { x: 104.5 * TILE, y: 13 * TILE, w: 72, h: 8, axis: 'y', min: 118, max: 232, speed: 0.55, dir: 1, dx: 0, dy: 0 },
        { x: 151 * TILE, y: 13 * TILE, w: 48, h: 8, axis: 'x', min: 151 * TILE, max: 154 * TILE, speed: 0.7, dir: 1, dx: 0, dy: 0 }
      ],
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
      onPartner: false, onPlatform: null, skid: false, animT: 0, absent: false
    };
  }

  // opts: { mode: 'solo'|'local'|'host'|'guest', soloColor: 'red'|'green', twoPlayer: bool }
  function createGame(opts) {
    opts = opts || {};
    var level = buildLevel();
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
    return {
      mode: opts.mode || 'local', twoPlayer: two,
      tick: 0, tiles: level.tiles, baseTiles: level.tiles.slice(),
      levelW: level.w, levelH: level.h,
      coinsArr: level.coins, enemies: level.enemies,
      switches: level.switches, gateTx: level.gateTx, gateOpen: 0, gateLatched: false,
      platforms: level.platforms,
      midpointTx: level.midpointTx, goalTx: level.goalTx, goalTopTy: level.goalTopTy,
      midReached: false, checkpoint: { x: 2 * TILE, y: 13 * TILE },
      players: players,
      berries: [], coinCount: 0, score: 0,
      timeLeft: 300 * 60, finished: false, finishTick: 0,
      camX: 0, events: [], tileDiff: {},
      rng: 12345
    };
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

  function knockOut(st, p) {
    p.state = 'bubble'; p.stateT = 0; p.vx = 0; p.vy = 0; p.big = false; p.hp = 1;
    ev(st, 'out');
  }

  function hurtPlayer(st, p, fromX) {
    if (p.state !== 'play' || p.invuln > 0) return;
    if (p.big) {
      p.big = false; p.hp = 1; p.invuln = 130;
      p.vx = (p.x + p.w / 2 < fromX ? -1.6 : 1.6); p.vy = -3.4;
      ev(st, 'shrink');
    } else {
      knockOut(st, p);
    }
  }

  function stepPlayer(st, p, input, partner) {
    if (p.absent || p.state === 'absent') return;
    p.animT++;
    if (p.invuln > 0) p.invuln--;
    if (p.squash > 0) p.squash--;

    if (p.state === 'bubble') {
      p.stateT++;
      // float toward a hover point above the partner (or checkpoint)
      var anchor = (partner && !partner.absent && partner.state === 'play')
        ? { x: partner.x + partner.w / 2, y: partner.y - 2 }
        : { x: st.checkpoint.x + 8, y: st.checkpoint.y - 40 };
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      p.x += (anchor.x - cx) * 0.045 + Math.sin(p.stateT * 0.08) * 0.3;
      p.y += (anchor.y - cy) * 0.045 + Math.cos(p.stateT * 0.06) * 0.2;
      // partner pops the bubble by touching it
      if (partner && !partner.absent && partner.state === 'play' && p.stateT > 40 && overlap(p, partner)) {
        p.state = 'play'; p.invuln = 130; p.vy = 0; p.vx = 0;
        p.y = partner.y - p.h - 1;
        ev(st, 'pop');
      } else if ((!partner || partner.absent || partner.state !== 'play') && p.stateT > 90) {
        // solo / both out: respawn at checkpoint
        p.state = 'play'; p.invuln = 130;
        p.x = st.checkpoint.x; p.y = st.checkpoint.y; p.vx = 0; p.vy = 0;
        ev(st, 'pop');
      }
      return;
    }

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
    if (p.y > st.levelH * TILE + 24) { knockOut(st, p); return; }

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
            } else {
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

    // timer
    if (!st.finished && st.timeLeft > 0) {
      st.timeLeft--;
      if (st.timeLeft === 0) {
        ev(st, 'timeout');
        for (var ri = 0; ri < st.players.length; ri++) {
          var rp = st.players[ri];
          if (rp.absent) continue;
          rp.state = 'play'; rp.x = st.checkpoint.x + ri * 20; rp.y = st.checkpoint.y;
          rp.vx = 0; rp.vy = 0; rp.invuln = 130;
        }
        st.timeLeft = 300 * 60;
      }
    }
    // camera: frame both active players
    var xs = [];
    for (var ci = 0; ci < st.players.length; ci++) {
      var cp = st.players[ci];
      if (!cp.absent && cp.state === 'play') xs.push(cp.x + cp.w / 2);
    }
    if (xs.length) {
      var mid = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
      var target = mid - VIEW_W / 2;
      var maxCam = st.levelW * TILE - VIEW_W;
      if (target < 0) target = 0; if (target > maxCam) target = maxCam;
      st.camX += (target - st.camX) * 0.12;
      // tether: keep players inside the camera view
      for (var ti = 0; ti < st.players.length; ti++) {
        var tp = st.players[ti];
        if (tp.absent || tp.state !== 'play') continue;
        if (tp.x < st.camX + 4) tp.x = st.camX + 4;
        if (tp.x + tp.w > st.camX + VIEW_W - 4) tp.x = st.camX + VIEW_W - 4 - tp.w;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Main step                                                           */
  /* ------------------------------------------------------------------ */
  function step(st, inputs) {
    st.events.length = 0;
    if (st.finished) { st.tick++; return; }
    stepWorld(st);
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

  /* ------------------------------------------------------------------ */
  /* Snapshots (netplay)                                                 */
  /* ------------------------------------------------------------------ */
  function round1(v) { return Math.round(v * 10) / 10; }
  function makeSnapshot(st) {
    return {
      tick: st.tick, camX: round1(st.camX), coins: st.coinCount, score: st.score,
      timeLeft: st.timeLeft, finished: st.finished, mid: st.midReached,
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
    st.gateOpen = s.gateOpen; st.gateLatched = s.gateLatched;
    s.switches.forEach(function (v, i) { st.switches[i].pressed = !!v; });
    s.players.forEach(function (a, i) {
      var p = st.players[i]; if (!p) return;
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
