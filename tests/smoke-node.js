/* tests/smoke-node.js — headless checks for engine.js (no DOM needed).
 * Run: node tests/smoke-node.js
 */
'use strict';
var E = require('../js/engine.js');
var TILE = E.TILE;
var fails = 0, checks = 0;

function ok(name, cond, extra) {
  checks++;
  if (!cond) { fails++; console.log('FAIL  ' + name + (extra ? '  ' + JSON.stringify(extra) : '')); }
  else console.log('ok    ' + name);
}
function game(opts) {
  var st = E.createGame(Object.assign({ mode: 'solo', soloColor: 'red', twoPlayer: false }, opts || {}));
  st.camX = 0;
  return st;
}
function stepN(st, n, inputs) {
  for (var i = 0; i < n; i++) E.step(st, inputs || [E.EMPTY_INPUT, E.EMPTY_INPUT]);
  return st;
}
function findPlayer(st, color) {
  return st.players.filter(function (p) { return p.color === color; })[0];
}

/* ---- four stages, four layouts, four casts ---- */
var STAGES = ['izmir', 'nyc', 'istanbul', 'tampa'];
var lvl = E.buildLevel();
ok('the default level is the İzmir one', lvl.stage === 'izmir' && E.buildLevel('nope').stage === 'izmir');
ok('every stage is 300 x 18', STAGES.every(function (id) {
  var l2 = E.buildLevel(id);
  return l2.w === 300 && l2.h === 18;
}));
ok('every stage has 4-5 moving platforms', STAGES.every(function (id) {
  var n = E.buildLevel(id).platforms.length;
  return n >= 4 && n <= 5;
}), STAGES.map(function (id) { return E.buildLevel(id).platforms.length; }));
ok('every stage keeps 2 floor plates and the gate at x=70', STAGES.every(function (id) {
  var l2 = E.buildLevel(id);
  return l2.switches.length === 2 && l2.gateTx === 70 && l2.switches[0].tx === 63 && l2.switches[1].tx === 66;
}));
ok('every stage keeps the midpoint and goal anchors', STAGES.every(function (id) {
  var l2 = E.buildLevel(id);
  return l2.midpointTx === 160 && l2.goalTx === 289 && l2.goalTopTy === 9;
}));
ok('every stage carries 100-170 bananas', STAGES.every(function (id) {
  var n = E.buildLevel(id).coins.length;
  return n >= 100 && n <= 170;
}), STAGES.map(function (id) { return E.buildLevel(id).coins.length; }));
ok('every stage has 20-30 critters spread over the course', STAGES.every(function (id) {
  var n = E.buildLevel(id).enemies.length;
  return n >= 20 && n <= 30;
}), STAGES.map(function (id) { return E.buildLevel(id).enemies.length; }));
ok('every stage carries all four foods', STAGES.every(function (id) {
  var t = E.buildLevel(id).foods.map(function (f) { return f.type; });
  return t.indexOf('lahmacun') >= 0 && t.indexOf('baklava') >= 0 &&
         t.indexOf('ayran') >= 0 && t.indexOf('sujuk') >= 0;
}), STAGES.map(function (id) { return E.buildLevel(id).foods.map(function (f) { return f.type; }).join(','); }));
var layouts = STAGES.map(function (id) { return JSON.stringify(E.buildLevel(id).tiles); });
ok('no two stages share a terrain', new Set(layouts).size === 4);
ok('the gate tower really blocks the walkway on every stage', STAGES.every(function (id) {
  var l2 = E.buildLevel(id);
  for (var ty = 9; ty <= 14; ty++) if (l2.tiles[ty * l2.w + 70] !== E.T.GATE) return false;
  return true;
}));
ok('no moving platform sweeps through terrain', STAGES.every(function (id) {
  var l2 = E.buildLevel(id);
  function solid(x, y) {
    if (x < 0 || x >= l2.w) return true;
    if (y < 0 || y >= l2.h) return false;
    return l2.tiles[y * l2.w + x] !== E.T.EMPTY;
  }
  return l2.platforms.every(function (p) {
    var xs = [], ys = [];
    if (p.axis === 'x') for (var x = p.min; x <= p.max; x += 2) xs.push(x); else xs.push(p.x);
    if (p.axis === 'y') for (var y = p.min; y <= p.max; y += 2) ys.push(y); else ys.push(p.y);
    for (var i = 0; i < xs.length; i++) for (var j = 0; j < ys.length; j++) {
      var tx0 = Math.floor(xs[i] / TILE), tx1 = Math.floor((xs[i] + p.w - 0.01) / TILE);
      var ty0 = Math.floor(ys[j] / TILE), ty1 = Math.floor((ys[j] + p.h - 0.01) / TILE);
      for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) if (solid(tx, ty)) return false;
    }
    return true;
  });
}));

/* every stage mixes its own themed critter with the plain walker and the
 * sheller, so the shell rule is on every map */
var THEME = { izmir: 'icecream', nyc: 'hoodlum', istanbul: 'uncle', tampa: 'grump' };
ok('each stage has themed, plain and shell critters', STAGES.every(function (id) {
  var es = E.buildLevel(id).enemies;
  var skins = es.map(function (e) { return e.skin || e.type; });
  return skins.indexOf(THEME[id]) >= 0 && skins.indexOf('walker') >= 0 && skins.indexOf('sheller') >= 0;
}), STAGES.map(function (id) { return E.buildLevel(id).enemies.map(function (e) { return e.skin || e.type; }).join(','); }));
ok('themed pedestrians stand about as tall as a buddy', STAGES.every(function (id) {
  return E.buildLevel(id).enemies.every(function (e) { return !e.skin || e.h === 20; });
}));
ok('plain critters are close to buddy height too', STAGES.every(function (id) {
  return E.buildLevel(id).enemies.every(function (e) { return e.skin || e.h === 18; });
}));

/* ---- run / skid / jump basics ---- */
var st = game();
st.enemies.length = 0;                 // isolate movement from critters
var p = findPlayer(st, 'red');
stepN(st, 40);
ok('player settles on the ground', Math.abs(p.y - 218) < 1.5, { y: p.y });
var x0 = p.x;
stepN(st, 60, [{ l: false, r: true, u: false, d: false, run: false }, E.EMPTY_INPUT]);
ok('holds right without running', p.x > x0 + 30, { x0: x0, x: p.x });
var stR2 = game();
stR2.enemies.length = 0;
var pR2 = findPlayer(stR2, 'red');
pR2.x = 4 * TILE;
stepN(stR2, 10);
var x1 = pR2.x;
stepN(stR2, 50, [{ l: false, r: true, u: false, d: false, run: true }, E.EMPTY_INPUT]);
ok('run is faster', pR2.x - x1 > 90, { moved: pR2.x - x1 });

var st2 = game();
st2.enemies.length = 0;
var p2 = findPlayer(st2, 'red');
stepN(st2, 30);
var groundY = p2.y;
E.step(st2, [{ l: false, r: false, u: true, d: false, run: false }, E.EMPTY_INPUT]);
ok('jump leaves the ground', p2.vy < 0, { vy: p2.vy });
var apex = groundY;
for (var i = 0; i < 60; i++) { E.step(st2, [{ l: false, r: false, u: false, d: false, run: false }, E.EMPTY_INPUT]); apex = Math.min(apex, p2.y); }
ok('jump reaches a sensible height', groundY - apex > 30 && groundY - apex < 90, { rise: groundY - apex });
ok('lands again', Math.abs(p2.y - groundY) < 2, { y: p2.y, groundY: groundY });

/* ---- gate: solo needs only one switch ---- */
var st3 = game();
var g = findPlayer(st3, 'red');
st3.camX = 700;
st3.players.forEach(function (q) { q.x = 760; q.y = 218; });
g.x = 63 * TILE + 4; g.y = 210;      // above the first plate
stepN(st3, 30);
ok('switch presses under the player', st3.switches[0].pressed === true);
ok('solo gate latches from one switch', st3.gateLatched === true);
stepN(st3, 60);
ok('gate opens', st3.gateOpen > 0.95, { open: st3.gateOpen });

/* ---- 2P gate needs both switches ---- */
var st4 = game({ mode: 'local', twoPlayer: true });
st4.camX = 700;
st4.players.forEach(function (q) { q.x = 880; q.y = 218; });
st4.players[0].x = 63 * TILE + 4; st4.players[0].y = 210;
stepN(st4, 24);
ok('one of two switches is not enough', st4.gateLatched === false);
st4.players[1].x = 66 * TILE + 4; st4.players[1].y = 210;
stepN(st4, 24);
ok('both switches open the gate', st4.gateLatched === true);

/* ---- head bounce gives the 1.22x boost ---- */
var st5 = game({ mode: 'local', twoPlayer: true });
st5.camX = 200;
var a = st5.players[0], b = st5.players[1];
a.x = 300; a.y = 218; a.vy = 0; a.onGround = true;
b.x = 301; b.y = 198; b.vy = 5;
var bounced = false;
for (var k = 0; k < 8; k++) {
  E.step(st5, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
  if (b.vy <= -5.3) bounced = true;
}
ok('landing hard on a head bounces higher', bounced, { vy: b.vy });

/* ---- head stand lets you jump from the partner ---- */
var st6 = game({ mode: 'local', twoPlayer: true });
st6.camX = 200;
var a6 = st6.players[0], b6 = st6.players[1];
a6.x = 300; a6.y = 218; a6.vy = 0;
b6.x = 300; b6.y = 196; b6.vy = 0.5;
stepN(st6, 6);
ok('partner can stand on your head', b6.onPartner === true || b6.y < 200, { y: b6.y, onPartner: b6.onPartner });

/* ---- power-up grants an extra hit ---- */
var st7 = game();
var p7 = findPlayer(st7, 'red');
st7.berries.push({ x: p7.x, y: p7.y + 4, w: 14, h: 12, vx: 0, vy: 0 });
E.step(st7, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('spread jar grants a power state', p7.big === true, { big: p7.big });
p7.invuln = 0;
st7.enemies.push({ type: 'walker', x: p7.x, y: p7.y, w: 13, h: 18, vx: 0, vy: 0, dir: 1, state: 'walk', timer: 0, dead: false, onGround: true });
E.step(st7, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('a hit costs one of the three stars, not the run', p7.hp === 2 && p7.state === 'play', { hp: p7.hp, state: p7.state });
p7.invuln = 0; p7.x = st7.enemies[0].x + 2; p7.y = st7.enemies[0].y;
E.step(st7, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('the second hit costs another star', p7.hp === 1 && p7.state === 'play', { hp: p7.hp });
p7.invuln = 0; p7.x = st7.enemies[0].x + 2; p7.y = st7.enemies[0].y;
E.step(st7, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('the third hit knocks a buddy down', p7.state === 'ko' && st7.lives === 2, { state: p7.state, lives: st7.lives });

/* ---- checkpoint + goal ---- */
var st8 = game();
var p8 = findPlayer(st8, 'red');
st8.camX = 2400;
p8.x = 160 * TILE + 20; p8.y = 218;
E.step(st8, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('midpoint sets the checkpoint', st8.midReached === true && st8.checkpoint.x === 160 * TILE);

st8.camX = 4400;
p8.x = 289 * TILE + 4; p8.y = 9 * TILE - 30;
E.step(st8, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('crossing the goal finishes the stage', st8.finished === true);
ok('finishing awards 1000', st8.score >= 1000);

/* ---- solo: a pit fall costs a life and respawns at the checkpoint ---- */
var st9 = game();
var p9 = findPlayer(st9, 'red');
st9.checkpoint = { x: 500, y: 218 };
st9.camX = 300;
p9.x = 500; p9.y = st9.levelH * TILE + 40;
E.step(st9, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('solo pit fall costs a life (no bubble)', st9.lives === 2 && p9.state === 'ko', { lives: st9.lives, state: p9.state });
stepN(st9, 50);
ok('respawns at the checkpoint after the life', p9.state === 'play' && Math.abs(p9.x - 500) < 40, { x: p9.x, y: p9.y });

/* ---- lives and hearts ---- */
var stL = game();
stL.enemies.length = 0;
var pL = findPlayer(stL, 'red');
var deaths = 0;
while (!stL.gameOver && deaths < 5) {
  pL.x = 400; pL.y = stL.levelH * TILE + 40;
  E.step(stL, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
  deaths++;
  ok('solo death ' + deaths + ' costs one life', stL.lives === 3 - deaths, { lives: stL.lives });
  stepN(stL, 50);
}
ok('three lives ends in game over', stL.gameOver === true && stL.lives === 0);
ok('game over freezes the simulation', (function () {
  var before = stL.tick;
  stepN(stL, 10);
  return stL.tick === before + 10 && stL.gameOver;
})());

/* ---- co-op: bubble, partner down, team life loss ---- */
var stM = game({ mode: 'local', twoPlayer: true });
stM.enemies.length = 0;
var m0 = stM.players[0], m1 = stM.players[1];
m0.x = 200; m0.y = stM.levelH * TILE + 40;
E.step(stM, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('co-op down bubbles the player, no life lost', m0.state === 'bubble' && stM.lives === 3, { a: m0.state, lives: stM.lives });
m1.x = 260; m1.y = stM.levelH * TILE + 40;
E.step(stM, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('partner down while one is bubbled costs a team life', stM.lives === 2 && m0.state === 'ko' && m1.state === 'ko', { lives: stM.lives });
stepN(stM, 50);
ok('both players respawn after the team wipe', m0.state === 'play' && m1.state === 'play' && stM.lives === 2);
ok('respawn restores one heart each', m0.big === false && m1.big === false);

/* ---- the death pop is staged where the player last stood ---- */
var stD = game();
stD.enemies.length = 0;
var d0 = stD.players[0];
d0.safeY = 218;
d0.x = 500; d0.y = 900;
E.step(stD, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('a pit death pops out at the last safe spot', d0.state === 'ko' && d0.y === 218, { state: d0.state, y: d0.y });

/* ---- catch-up: a partner left far behind is carried forward ---- */
var stC = game({ mode: 'local', twoPlayer: true });
stC.enemies.length = 0;
var cFront = stC.players[0], cBack = stC.players[1];
cFront.x = 600; cBack.x = 100;
var camBefore = stC.camX;
stepN(stC, 30);
ok('camera follows the front player when the pair splits', stC.camX > camBefore + 200 && Math.abs(cFront.x - 600) < 12, { cam: Math.round(stC.camX) });
ok('a partner left behind is carried in a bubble', cBack.state === 'bubble' && cBack.carry === true && stC.lives === 3, { state: cBack.state, carry: cBack.carry });
stepN(stC, 90);
ok('the carry bubble delivers them to their partner', cBack.state === 'play' && Math.abs(cBack.x - cFront.x) < 40 && stC.lives === 3, { x: Math.round(cBack.x), front: Math.round(cFront.x) });
var stS = game({ mode: 'solo' });
stS.enemies.length = 0;
stS.players[0].x = 300;
stepN(stS, 20);
ok('solo never gets the carry bubble', stS.players[0].state === 'play');

/* ---- the bubble waits for a deliberate rescue ---- */
var stB = game({ mode: 'local', twoPlayer: true });
stB.enemies.length = 0;
var s0 = stB.players[0], s1 = stB.players[1];
s0.x = 200; s0.y = stB.levelH * TILE + 40;
E.step(stB, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
s1.x = 420;
stepN(stB, 180);
ok('bubble keeps waiting while the partner is away', s0.state === 'bubble' && stB.lives === 3, { state: s0.state, lives: stB.lives });
s1.x = s0.x; s1.y = s0.y;
stepN(stB, 20);
ok('partner touching the bubble pops it', s0.state === 'play' && stB.lives === 3, { state: s0.state, lives: stB.lives });

/* ---- timeout also costs a life ---- */
var stT = game();
stT.enemies.length = 0;
stT.timeLeft = 1;
E.step(stT, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('running out of time costs a life', stT.lives === 2, { lives: stT.lives });

/* ---- a plain enemy hit in solo is a life, not a bubble ---- */
var stH = game();
stH.enemies.length = 1;
var h0 = stH.players[0];
h0.x = 100; h0.y = 218; h0.invuln = 0; h0.vy = 0;
stH.enemies[0].x = h0.x + 2; stH.enemies[0].y = h0.y + 6;
stH.enemies[0].state = 'walk'; stH.enemies[0].vy = 0; stH.enemies[0].dead = false;
E.step(stH, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('a hit on the last star costs a life in solo', h0.hp === 2 && h0.state === 'play' && stH.lives === 3,
   { hp: h0.hp, lives: stH.lives, state: h0.state });
h0.hp = 1; h0.invuln = 0;
h0.x = 100; h0.y = 218;
stH.enemies[0].x = h0.x + 2; stH.enemies[0].y = h0.y + 6;
E.step(stH, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('solo enemy hit costs a life, never a bubble', stH.lives === 2 && h0.state === 'ko', { lives: stH.lives, state: h0.state });
stepN(stH, 50);
ok('solo comes back from a hit at the checkpoint', h0.state === 'play' && stH.lives === 2, { state: h0.state });
ok('the respawn refills all three stars', h0.hp === 3, { hp: h0.hp });

/* ---- snapshots carry lives and game over ---- */
var hostL = game({ mode: 'host', twoPlayer: true });
hostL.lives = 2;
var guestL = E.createGame({ mode: 'guest', twoPlayer: true });
E.applySnapshot(guestL, JSON.parse(JSON.stringify(E.makeSnapshot(hostL))));
ok('snapshot carries lives', guestL.lives === 2);
ok('snapshot carries the death pop position', (function () {
  var h = game({ mode: 'host', twoPlayer: true });
  h.enemies.length = 0;
  var hp0 = h.players[0], hp1 = h.players[1];
  hp0.safeY = 218; hp0.x = 500; hp0.y = 900;
  E.step(h, [E.EMPTY_INPUT, E.EMPTY_INPUT]);          // downed -> bubble
  hp1.safeY = 218; hp1.x = 520; hp1.y = 900;
  E.step(h, [E.EMPTY_INPUT, E.EMPTY_INPUT]);          // partner down -> team wipe
  var gst = E.createGame({ mode: 'guest', twoPlayer: true });
  E.applySnapshot(gst, JSON.parse(JSON.stringify(E.makeSnapshot(h))));
  var gp = gst.players[0];
  return h.players[0].state === 'ko' && gp.state === 'ko' && gp.y === 218;
})());
hostL.gameOver = true;
E.applySnapshot(guestL, JSON.parse(JSON.stringify(E.makeSnapshot(hostL))));
ok('snapshot carries game over', guestL.gameOver === true);

/* ---- nothing ever goes non-finite, even under abuse ---- */
var stA = game({ mode: 'local', twoPlayer: true });
var randomInputs = [
  { l: true, r: false, u: true, d: false, run: true },
  { l: false, r: true, u: true, d: false, run: false },
  { l: true, r: true, u: false, d: true, run: true },
  E.EMPTY_INPUT
];
var bad = 0;
for (var n = 0; n < 12000; n++) {
  var inp = randomInputs[n % 4];
  E.step(stA, [inp, randomInputs[(n + 2) % 4]]);
  for (var qi = 0; qi < stA.players.length; qi++) {
    var q = stA.players[qi];
    if (!q.absent && (!isFinite(q.x) || !isFinite(q.y))) bad++;
  }
}
ok('long random run never produces NaN positions', bad === 0, { bad: bad });
ok('players stay inside the level', stA.players.every(function (q) { return q.x > -8 && q.x < stA.levelW * TILE + 8; }));

/* ---- snapshot round trip (online path) ---- */
var host = game({ mode: 'host', twoPlayer: true });
stepN(host, 120);
var snap = JSON.parse(JSON.stringify(E.makeSnapshot(host)));
var guest = E.createGame({ mode: 'guest', twoPlayer: true });
E.applySnapshot(guest, snap);
ok('snapshot round-trips positions', Math.abs(guest.players[0].x - host.players[0].x) < 0.2, {
  host: host.players[0].x, guest: guest.players[0].x
});
ok('snapshot round-trips tiles', JSON.stringify(guest.tiles) === JSON.stringify(host.tiles));

/* ---- an online pair builds the same stage on both ends ---- */
ok('host and guest share the critter list on every stage', STAGES.every(function (id) {
  var h = E.createGame({ mode: 'host', twoPlayer: true, stage: id });
  var gst = E.createGame({ mode: 'guest', twoPlayer: true, stage: id });
  if (h.enemies.length !== gst.enemies.length) return false;
  if (h.stage !== gst.stage || h.stage !== id) return false;
  E.applySnapshot(gst, E.makeSnapshot(h));
  return Math.abs(gst.enemies[0].x - h.enemies[0].x) < 0.2;
}));

/* ---- each stage is walked from spawn to goal on paper ---- */
/* A jump-aware flood fill over standable tiles: the player stands on a
 * solid tile with two tiles of headroom, walks, drops off ledges and jumps
 * up to 4 tiles up, 6 across and 7 down. Moving platforms count at every
 * point of their travel. This is what catches a layout with a wall no
 * jump can clear or a pit wider than a running jump. */
function terrainSolid(l2, x, y) {
  if (x < 0 || x >= l2.w) return true;
  if (y < 0 || y >= l2.h) return false;
  var v = l2.tiles[y * l2.w + x];
  if (v === E.T.GATE) return false;      // the plates open it, so it is not a wall
  return v !== E.T.EMPTY;
}
function flood(id) {
  var l2 = E.buildLevel(id);
  var W = l2.w, H = l2.h;
  var nodes = new Map();
  function add(x, y) {
    if (x < 0 || x >= W || y < 1 || y >= H) return;
    if (terrainSolid(l2, x, y) || terrainSolid(l2, x, y - 1) || !terrainSolid(l2, x, y + 1)) return;
    nodes.set(x + ',' + y, { x: x, y: y });
  }
  for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) add(xx, yy);
  l2.platforms.forEach(function (p) {
    if (p.axis === 'y') {
      for (var surf = Math.ceil(p.min / TILE); surf <= Math.floor(p.max / TILE); surf++) {
        for (var x = Math.floor((p.x + 2) / TILE); x <= Math.floor((p.x + p.w - 2) / TILE); x++) {
          if (!terrainSolid(l2, x, surf) && !terrainSolid(l2, x, surf - 1)) nodes.set(x + ',' + (surf - 1), { x: x, y: surf - 1 });
        }
      }
    } else {
      var sy = Math.round(p.y / TILE);
      for (var sx = Math.floor(p.min / TILE); sx <= Math.floor((p.max + p.w) / TILE); sx++) {
        if (!terrainSolid(l2, sx, sy) && !terrainSolid(l2, sx, sy - 1)) nodes.set(sx + ',' + (sy - 1), { x: sx, y: sy - 1 });
      }
    }
  });
  var start = nodes.get('3,14');
  if (!start) return { ok: false, seen: new Set(), lvl: l2 };
  var seen = new Set(['3,14']);
  var q = [start];
  var reachedGoal = false;
  while (q.length) {
    var n = q.shift();
    if (n.x >= 288 && n.y <= 9) reachedGoal = true;
    var out = [];
    [-1, 1].forEach(function (dx) {
      for (var y = n.y - 1; y < n.y + 3; y++) {
        if (nodes.has((n.x + dx) + ',' + y)) out.push(nodes.get((n.x + dx) + ',' + y));
        if (terrainSolid(l2, n.x + dx, y)) break;
      }
      for (var y2 = n.y; y2 < H; y2++) {
        if (nodes.has((n.x + dx) + ',' + y2)) { out.push(nodes.get((n.x + dx) + ',' + y2)); break; }
        if (terrainSolid(l2, n.x + dx, y2)) break;
      }
    });
    for (var dx2 = -6; dx2 <= 6; dx2++) {
      if (!dx2) continue;
      for (var dy = -4; dy <= 7; dy++) {
        var x2 = n.x + dx2, y3 = n.y + dy;
        var k = x2 + ',' + y3;
        if (!nodes.has(k)) continue;
        var top = Math.min(n.y, y3) - 1, clear = true;
        for (var cx = Math.min(n.x, x2); cx <= Math.max(n.x, x2) && clear; cx++) {
          for (var cy = top - 2; cy <= top; cy++) if (terrainSolid(l2, cx, cy)) { clear = false; break; }
        }
        if (clear) out.push(nodes.get(k));
      }
    }
    out.forEach(function (m) {
      var kk = m.x + ',' + m.y;
      if (seen.has(kk)) return;
      seen.add(kk); q.push(m);
    });
  }
  return { ok: reachedGoal, seen: seen, lvl: l2 };
}
var floods = {};
STAGES.forEach(function (id) {
  floods[id] = flood(id);
  ok('stage ' + id + ' can be walked from spawn to goal', floods[id].ok);
});
/* The spacing pass may nudge a snack a tile or two; it must never nudge it
 * out of the playable route. Every food has to sit within one jump of a
 * tile the flood fill actually reaches. */
ok('every food sits within a jump of the route', STAGES.every(function (id) {
  var seen = floods[id].seen;
  return game({ stage: id }).foods.every(function (f) {
    var fx = Math.floor((f.x + f.w / 2) / TILE), fy = Math.floor((f.y + f.h / 2) / TILE);
    var hit = false;
    seen.forEach(function (k) {
      var p = k.split(','), dx = Math.abs(+p[0] - fx), dy = Math.abs(+p[1] - fy);
      if (dx <= 3 && dy <= 5) hit = true;
    });
    return hit;
  });
}), STAGES.map(function (id) {
  var seen = floods[id].seen, far = [];
  game({ stage: id }).foods.forEach(function (f) {
    var fx = Math.floor((f.x + f.w / 2) / TILE), fy = Math.floor((f.y + f.h / 2) / TILE);
    var hit = false;
    seen.forEach(function (k) {
      var p = k.split(',');
      if (Math.abs(+p[0] - fx) <= 3 && Math.abs(+p[1] - fy) <= 5) hit = true;
    });
    if (!hit) far.push(f.type + '@' + fx + ',' + fy);
  });
  return far;
}));
/* long courses should offer a genuine upper route, not one low corridor */
STAGES.forEach(function (id) {
  var high = 0, mid = 0, late = 0;
  floods[id].seen.forEach(function (k) {
    var xy = k.split(','), x = +xy[0], y = +xy[1];
    if (y <= 10) high++;
    if (y === 12) mid++;
    if (x > 150) late++;
  });
  ok('stage ' + id + ' has a usable upper route', high >= 50, { high: high });
  ok('stage ' + id + ' keeps mid-height ledges reachable', mid >= 4, { mid: mid });
  ok('stage ' + id + ' opens up in its second half too', late > 40, { late: late });
});
ok('no reachable spot has a low ceiling', STAGES.every(function (id) {
  var l2 = floods[id].lvl;
  var bad = 0;
  floods[id].seen.forEach(function (k) {
    var xy = k.split(','), x = +xy[0], y = +xy[1];
    if (y - 2 >= 0 && terrainSolid(l2, x, y - 2)) bad++;
  });
  return bad === 0;
}));

/* ---- the run clock used by the summary ---- */
var stR = game();
stR.enemies.length = 0;
stepN(stR, 30);
ok('run clock counts active play', stR.runTicks === 30, { t: stR.runTicks });
stR.finished = true;
stepN(stR, 5);
ok('run clock stops when the stage ends', stR.runTicks === 30, { t: stR.runTicks });

/* ---- local bests, per stage and per mode ---- */
var mem = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; }
};
require('../js/progress.js');
var Best = global.Best;
Best.reset();
ok('host and guest share the online records', Best.modeKey('host') === 'online' && Best.modeKey('guest') === 'online' && Best.modeKey('local') === 'local');

var b1 = Best.submit('izmir', 'solo', { score: 1200, cleared: true, timeMs: 95000 });
ok('first clear sets a best score and time', b1.newScore && b1.newTime && b1.bestScore === 1200 && b1.bestTimeMs === 95000);
var b2 = Best.submit('izmir', 'solo', { score: 900, cleared: true, timeMs: 120000 });
ok('a weaker run keeps the records', !b2.newScore && !b2.newTime && b2.bestScore === 1200 && b2.bestTimeMs === 95000);
var b3 = Best.submit('izmir', 'solo', { score: 2000, cleared: false, timeMs: 1000 });
ok('a game-over run can take the score but never the time', b3.newScore && !b3.newTime && b3.bestScore === 2000 && b3.bestTimeMs === 95000);
var b4 = Best.submit('izmir', 'online', { score: 100, cleared: true, timeMs: 200000 });
ok('modes keep separate records', b4.bestScore === 100 && b4.newTime && Best.get('izmir', 'solo').score === 2000);
var b5 = Best.submit('nyc', 'solo', { score: 50, cleared: true, timeMs: 80000 });
ok('stages keep separate records', b5.newTime && Best.get('nyc', 'solo').timeMs === 80000 && Best.get('izmir', 'solo').timeMs === 95000);
ok('bests are written to storage under one versioned key', JSON.parse(mem[Best.key]).izmir.solo.score === 2000);
ok('best time is the fastest clear only', (function () {
  Best.submit('tampa', 'solo', { score: 10, cleared: true, timeMs: 120000 });
  var fast = Best.submit('tampa', 'solo', { score: 10, cleared: true, timeMs: 60000 });
  var slow = Best.submit('tampa', 'solo', { score: 10, cleared: true, timeMs: 90000 });
  return fast.newTime && !slow.newTime && Best.get('tampa', 'solo').timeMs === 60000;
})());

/* ---- language strings: English and Turkish stay in lockstep ---- */
var fs = require('fs'), path = require('path');
require('../js/i18n.js');
var I18n = global.I18n;
var en = I18n.dict.en, tr = I18n.dict.tr;
ok('every English string has a Turkish translation',
  Object.keys(en).every(function (k) { return typeof tr[k] === 'string' && tr[k].length > 0; }),
  { missing: Object.keys(en).filter(function (k) { return !tr[k]; }).slice(0, 6) });
ok('no Turkish-only keys',
  Object.keys(tr).every(function (k) { return k in en; }),
  { extra: Object.keys(tr).filter(function (k) { return !(k in en); }).slice(0, 6) });

/* every data-i18n hook in the page must resolve to a real string */
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var hookKeys = {}, hm;
var hookRe = /data-i18n(?:-html|-placeholder|-title|-aria)?="([^"]+)"/g;
while ((hm = hookRe.exec(html))) hookKeys[hm[1]] = true;
var missingHooks = Object.keys(hookKeys).filter(function (k) { return !(k in en); });
ok('every markup string key exists in the dictionary', missingHooks.length === 0, { missing: missingHooks });

/* and every literal T('...') key used by the UI code */
var mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
var tKeys = {}, tm;
var tRe = /T\('([a-z][\w.]+)'/g;
while ((tm = tRe.exec(mainSrc))) tKeys[tm[1]] = true;
var missingT = Object.keys(tKeys).filter(function (k) { return !(k in en); });
ok('every runtime string key exists in the dictionary', missingT.length === 0, { missing: missingT });

I18n.setLang('en');
var enJump = I18n.t('ctrl.jump');
I18n.setLang('tr');
ok('switching language changes the strings', I18n.lang === 'tr' && I18n.t('ctrl.jump') !== enJump, { jump: I18n.t('ctrl.jump') });
ok('turkish stage tags are translated', I18n.stageTag('nyc') === 'gece bulvarı' && I18n.stageName('nyc') === 'New York');
ok('turkish mode labels', I18n.modeName('host') === 'Çevrimiçi ortak' && I18n.modeHud('guest').indexOf('MİSAFİR') >= 0);
ok('placeholders are interpolated', I18n.t('summary.target', { n: '9,999' }).indexOf('9,999') >= 0);
ok('english fallback for an unknown key', I18n.t('no.such.key') === 'no.such.key');
I18n.setLang('en');
ok('switching back restores English', I18n.t('ctrl.jump') === 'Jump' && I18n.lang === 'en');

/* ---- volume: one master level for effects and music ---- */
require('../js/audio.js');
var Sfx = global.Sfx;
ok('volume defaults to 0.8', Sfx.getVolume() === 0.8, { v: Sfx.getVolume() });
Sfx.setVolume(0.35);
ok('volume accepts 0..1', Sfx.getVolume() === 0.35);
Sfx.setVolume(4);
ok('volume clamps above 1', Sfx.getVolume() === 1);
Sfx.setVolume(-2);
ok('volume clamps below 0', Sfx.getVolume() === 0);
Sfx.setVolume(0.8);

/* ---- each stage selects its own loop (silent in Node, no AudioContext) ---- */
Sfx.startMusic('izmir');
ok('music starts on the selected stage', Sfx.stage() === 'izmir');
Sfx.startMusic('nyc');
ok('music switches to the New York loop', Sfx.stage() === 'nyc');
Sfx.startMusic('istanbul');
ok('music switches to the Istanbul loop', Sfx.stage() === 'istanbul');
Sfx.startMusic('tampa');
ok('music switches to the Tampa loop', Sfx.stage() === 'tampa');
Sfx.startMusic('nonsense');
ok('unknown stage falls back to the base loop', Sfx.stage() === 'izmir');
Sfx.stopMusic();

/* ---- camera: readable buddy on a phone, partner still in frame ---- */
require('../js/camera.js');
var Cam = global.LeapCam;
var COS = Math.cos(Cam.YAW);
function buddy(x, absent) { return { x: x, w: 12, absent: !!absent, state: absent ? 'absent' : 'play' }; }
function pair(x0, x1) { return [buddy(x0), buddy(x1)]; }
function charPx(fr, cssH) { return Cam.PLAYER_H * cssH / (2 * fr.halfH); }
function inside(fr, xs) {
  var worst = 0;
  for (var n = 0; n < xs.length; n++) {
    worst = Math.max(worst, Math.abs(xs[n] + 6 - fr.centerX) * COS + 6);
  }
  return worst <= fr.halfW + 0.01;
}

var deskFr = Cam.frame({ cssW: 1024, cssH: 576, levelW: 3200, center: 256, players: pair(34, 66) });
ok('desktop keeps the old fixed framing', deskFr.zoom === 1 &&
   deskFr.halfW === Cam.baseHalfWidth(1024, 576).halfW && deskFr.centerX === 256, { zoom: deskFr.zoom });
ok('desktop camera centre is untouched', deskFr.centerY === -Cam.VIEW_H / 2 && deskFr.mix === 0);

var phoneFr = Cam.frame({ cssW: 390, cssH: 280, levelW: 3200, center: 256, players: pair(34, 66) });
ok('a phone zooms in', phoneFr.zoom > 1.2, { zoom: phoneFr.zoom });
ok('the buddy renders at the readable size', charPx(phoneFr, 280) >= Cam.MIN_PLAYER_PX - 0.01,
   { px: charPx(phoneFr, 280), min: Cam.MIN_PLAYER_PX });
ok('close buddies still fit the zoomed frame', inside(phoneFr, [34, 66]), { center: phoneFr.centerX });
ok('a zoomed frame stays inside the level', phoneFr.centerX >= phoneFr.halfW / COS - 0.01,
   { center: phoneFr.centerX, edge: phoneFr.halfW / COS });

var smallFr = Cam.frame({ cssW: 320, cssH: 280, levelW: 3200, center: 256, players: pair(34, 66) });
ok('a tiny screen still leaves play context', smallFr.halfW >= Cam.MIN_HALF_W - 0.01 && smallFr.zoom > 1.2,
   { halfW: smallFr.halfW });

/* 240 world units apart is just inside the engine's catch-up rule */
var splitFr = Cam.frame({ cssW: 320, cssH: 280, levelW: 3200, center: 256, players: pair(400, 640) });
ok('the camera pulls back for a distant partner', splitFr.halfW > smallFr.halfW,
   { split: splitFr.halfW, together: smallFr.halfW });
ok('both buddies stay in a split frame', inside(splitFr, [400, 640]),
   { center: splitFr.centerX, halfW: splitFr.halfW });
ok('a split frame centres between the pair', Math.abs(splitFr.centerX - 526) < 0.01, { center: splitFr.centerX });

var edgeFr = Cam.frame({ cssW: 390, cssH: 280, levelW: 3200, center: 16, players: pair(34, 66) });
ok('the zoomed frame never shows past the level start', edgeFr.centerX >= edgeFr.halfW / COS - 0.01,
   { center: edgeFr.centerX });
var endFr = Cam.frame({ cssW: 390, cssH: 280, levelW: 3200, center: 2944, players: pair(3130, 3160) });
ok('nor past the end of the level', endFr.centerX <= 3200 - endFr.halfW / COS + 0.01, { center: endFr.centerX });

var soloFr = Cam.frame({ cssW: 390, cssH: 280, levelW: 3200, center: 256, players: [buddy(400), buddy(90, true)] });
ok('an absent partner is not framed', Math.abs(soloFr.centerX - 406) < 0.01, { center: soloFr.centerX });
ok('solo still zooms and stays readable', soloFr.zoom > 1.2 && charPx(soloFr, 280) >= Cam.MIN_PLAYER_PX - 0.01);

var offFr = Cam.frame({ cssW: 390, cssH: 280, levelW: 3200, center: 256, players: pair(34, 66), zoom: false });
ok('?zoom=0 restores the fixed view', offFr.halfW === Cam.baseHalfWidth(390, 280).halfW && offFr.centerX === 256 && offFr.zoom === 1);

var landscapeFr = Cam.frame({ cssW: 780, cssH: 439, levelW: 3200, center: 256, players: pair(34, 66) });
ok('a phone held sideways needs no zoom', landscapeFr.zoom === 1, { zoom: landscapeFr.zoom });
ok('a very wide desktop never zooms out past the old view',
   Cam.frame({ cssW: 1920, cssH: 1080, levelW: 3200, center: 256, players: pair(0, 3000) }).halfW === Cam.baseHalfWidth(1920, 1080).halfW);

/* ---- critters never live inside terrain ---- */
function inTerrain(g2, b) {
  var tx0 = Math.floor(b.x / TILE), tx1 = Math.floor((b.x + b.w - 0.01) / TILE);
  var ty0 = Math.floor(b.y / TILE), ty1 = Math.floor((b.y + b.h - 0.01) / TILE);
  for (var ty = ty0; ty <= ty1; ty++) {
    for (var tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || tx >= g2.levelW) return true;
      if (ty < 0) continue;
      if (ty >= g2.levelH) continue;
      if (g2.tiles[ty * g2.levelW + tx] !== E.T.EMPTY) return true;
    }
  }
  return false;
}
var cm = game();
ok('no critter spawns buried in the level', cm.enemies.every(function (e) { return !inTerrain(cm, e); }),
   { buried: cm.enemies.filter(function (e) { return inTerrain(cm, e); }).map(function (e) { return Math.round(e.x / TILE); }) });
ok('nothing starts buried on any of the four stages', STAGES.every(function (id) {
  var g3 = game({ stage: id });
  return g3.enemies.every(function (e) { return !inTerrain(g3, e); });
}));
ok('no banana spawns inside terrain', STAGES.every(function (id) {
  var g3 = game({ stage: id });
  return g3.coinsArr.every(function (c) {
    return !inTerrain(g3, { x: c.x, y: c.y, w: 10, h: 10 });
  });
}), STAGES.map(function (id) {
  var g3 = game({ stage: id });
  return g3.coinsArr.filter(function (c) { return inTerrain(g3, { x: c.x, y: c.y, w: 10, h: 10 }); }).length;
}));
ok('no food spawns inside terrain', STAGES.every(function (id) {
  var g3 = game({ stage: id });
  return g3.foods.every(function (f) { return !inTerrain(g3, f); });
}), STAGES.map(function (id) {
  var g3 = game({ stage: id });
  return g3.foods.filter(function (f) { return inTerrain(g3, f); }).length;
}));
ok('no two foods share a pocket on any stage', STAGES.every(function (id) {
  var g3 = game({ stage: id });
  for (var i = 0; i < g3.foods.length; i++) {
    for (var j = i + 1; j < g3.foods.length; j++) {
      var a = g3.foods[i], b = g3.foods[j];
      if (Math.abs(a.x - b.x) < 20 && Math.abs(a.y - b.y) < 20) return false;
    }
  }
  return true;
}), STAGES.map(function (id) {
  var g3 = game({ stage: id }), hits = [];
  for (var i = 0; i < g3.foods.length; i++) {
    for (var j = i + 1; j < g3.foods.length; j++) {
      var a = g3.foods[i], b = g3.foods[j];
      if (Math.abs(a.x - b.x) < 20 && Math.abs(a.y - b.y) < 20) hits.push(a.type + '/' + b.type);
    }
  }
  return hits;
}));
ok('no food hovers inside a critter', STAGES.every(function (id) {
  var g3 = game({ stage: id });
  return g3.foods.every(function (f) {
    return g3.enemies.every(function (e) {
      return !(f.x < e.x + e.w + 8 && f.x + f.w + 8 > e.x &&
               f.y < e.y + e.h + 8 && f.y + f.h + 8 > e.y);
    });
  });
}), STAGES.map(function (id) {
  var g3 = game({ stage: id }), hits = [];
  g3.foods.forEach(function (f) {
    g3.enemies.forEach(function (e) {
      if (f.x < e.x + e.w + 8 && f.x + f.w + 8 > e.x &&
          f.y < e.y + e.h + 8 && f.y + f.h + 8 > e.y) hits.push(f.type + '@' + Math.round(f.x / TILE) + '/' + e.type);
    });
  });
  return hits;
}));
ok('every food type still appears after the spacing pass', STAGES.every(function (id) {
  var t = game({ stage: id }).foods.map(function (f) { return f.type; });
  return t.indexOf('lahmacun') >= 0 && t.indexOf('baklava') >= 0 &&
         t.indexOf('ayran') >= 0 && t.indexOf('sujuk') >= 0;
}));
var ist = game({ stage: 'istanbul' });
var terrace = ist.enemies.filter(function (e) {
  return e.x > 99 * TILE && e.x < 196 * TILE && e.y < 10 * TILE;
});
ok('the İstanbul terrace is patrolled by a crowd', terrace.length >= 5, { n: terrace.length });
stepN(ist, 30);
ok('terrace critters land on the terrace top, not inside it', terrace.every(function (e) {
  return Math.abs(e.y + e.h - 9 * TILE) < 0.6 && !inTerrain(ist, e);
}), { bottoms: terrace.map(function (e) { return e.y + e.h; }) });

var cm2 = game({ mode: 'local', twoPlayer: true });
stepN(cm2, 900);
var buried2 = cm2.enemies.filter(function (e) { return !e.dead && inTerrain(cm2, e); });
ok('critters patrol for 15s without ending up inside terrain', buried2.length === 0, { n: buried2.length });
ok('critters stay inside the level', cm2.enemies.every(function (e) {
  return e.dead || (e.x >= 0 && e.x <= cm2.levelW * TILE && e.y <= cm2.levelH * TILE);
}));

var cm3 = game();
cm3.enemies[0].x = 5 * TILE; cm3.enemies[0].y = 16 * TILE;   // shoved into the ground
stepN(cm3, 1);
ok('a critter shoved into terrain is lifted back out', !inTerrain(cm3, cm3.enemies[0]),
   { y: cm3.enemies[0].y, tile: Math.round(cm3.enemies[0].y / TILE) });

/* ---- a themed pedestrian is a plain stompable walker ---- */
var tp = game({ stage: 'istanbul' });
tp.enemies.length = 0;
var uncle = { type: 'walker', skin: 'uncle', x: 30 * TILE, y: 240 - 14, w: 14, h: 14, vx: -0.4, vy: 0, dir: -1, state: 'walk', timer: 0, dead: false, onGround: true };
tp.enemies.push(uncle);
var tpP = findPlayer(tp, 'red');
tpP.x = uncle.x + 2; tpP.y = uncle.y - tpP.h + 1; tpP.vy = 3; tpP.invuln = 0;
var tpScore = tp.score;
stepN(tp, 1);
ok('jumping on a themed pedestrian defeats it', uncle.dead === true && tp.score > tpScore, { dead: uncle.dead, score: tp.score - tpScore });
ok('a themed pedestrian never becomes a shell', uncle.state === 'walk');

/* ---- stomp -> shell -> kick keeps the shell silhouette ---- */
var sh = game();
sh.enemies.length = 0;
var sheller = { type: 'sheller', x: 30 * TILE, y: 240 - 14, w: 14, h: 14, vx: -0.4, vy: 0, dir: -1, state: 'walk', timer: 0, dead: false, onGround: true };
sh.enemies.push(sheller);
var sp = findPlayer(sh, 'red');
sp.x = sheller.x + 2; sp.y = sheller.y - sp.h + 1; sp.vy = 3; sp.invuln = 0;
stepN(sh, 1);
ok('stomping a sheller turns it into a shell', sheller.state === 'shell' && !sheller.dead, { state: sheller.state });
ok('the shell is a low body, not a full critter', sheller.h === 12, { h: sheller.h });
sp.state = 'play'; sp.invuln = 0; sp.vy = 0;
sp.x = sheller.x - 8; sp.y = sheller.y;
stepN(sh, 1);
ok('touching a shell kicks it sliding', sheller.state === 'slide' && sheller.vx > 1, { state: sheller.state, vx: sheller.vx });
ok('a sliding shell keeps the shell body (no pop back to a full sprite)', sheller.h === 12, { h: sheller.h });

var sh2 = game();
sh2.enemies.length = 0;
var wallShell = { type: 'sheller', x: 70 * TILE - 14, y: 240 - 12, w: 13, h: 12, vx: 3.3, vy: 0, dir: 1, state: 'slide', timer: 0, dead: false, onGround: true };
sh2.enemies.push(wallShell);
stepN(sh2, 1);
ok('a sliding shell bounces off a wall instead of vanishing into it', wallShell.vx < 0, { vx: wallShell.vx, x: wallShell.x });
ok('the wall-bounced shell is still a shell', wallShell.h === 12 && !inTerrain(sh2, wallShell), { h: wallShell.h });

var sh3 = game();
sh3.enemies.length = 0;
var restShell = { type: 'sheller', x: 20 * TILE, y: 240 - 12, w: 13, h: 12, baseH: 18, vx: 0, vy: 0, dir: 1, state: 'shell', timer: 0, dead: false, onGround: true };
sh3.enemies.push(restShell);
stepN(sh3, 500);
ok('a kicked-out shell wakes up and walks again', restShell.state === 'walk' && restShell.h === 18, { state: restShell.state, h: restShell.h });

/* ---- food: four voxel pickups, four different effects ---- */
function feed(st2, p2, type) {
  st2.foods.push({ type: type, x: p2.x, y: p2.y, w: 14, h: 14, taken: false });
  E.step(st2, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
}
var fd = game();
fd.enemies.length = 0;
var fp = findPlayer(fd, 'red');
stepN(fd, 5);
fp.hp = 1;
feed(fd, fp, 'baklava');
ok('baklava restores one star', fp.hp === 2, { hp: fp.hp });
fp.hp = 1;
feed(fd, fp, 'lahmacun');
ok('lahmacun restores the full three stars', fp.hp === 3, { hp: fp.hp });
var livesBefore = fd.lives;
feed(fd, fp, 'ayran');
ok('ayran grants an extra life', fd.lives === livesBefore + 1, { lives: fd.lives });
feed(fd, fp, 'sujuk');
ok('sujuk starts the invincibility timer', fp.star > 0, { star: fp.star });
fp.hp = 3; fp.invuln = 0; fp.vy = 0;
fd.enemies.push({ type: 'walker', skin: 'uncle', x: fp.x + 2, y: fp.y + 4, w: 13, h: 20, baseH: 20,
  vx: 0, vy: 0, dir: 1, state: 'walk', timer: 0, dead: false, onGround: true });
E.step(fd, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('sujuk knocks out a critter on contact', fd.enemies[fd.enemies.length - 1].dead === true);
ok('sujuk means no damage from that contact', fp.hp === 3 && fp.state === 'play', { hp: fp.hp, state: fp.state });
fp.star = 4;
stepN(fd, 6);
ok('the sujuk power runs out again', fp.star === 0, { star: fp.star });

/* ---- the star state survives the network snapshot ---- */
var snapHost = game({ mode: 'host', twoPlayer: true });
snapHost.players[0].hp = 2;
snapHost.players[0].star = 240;
var snapGuest = E.createGame({ mode: 'guest', twoPlayer: true });
E.applySnapshot(snapGuest, JSON.parse(JSON.stringify(E.makeSnapshot(snapHost))));
ok('snapshots carry stars and the sujuk timer', snapGuest.players[0].hp === 2 && snapGuest.players[0].star > 0,
   { hp: snapGuest.players[0].hp, star: snapGuest.players[0].star });

/* ---- every moving deck can actually be stood on, on every stage ---- */
STAGES.forEach(function (id) {
  var stP = game({ stage: id });
  stP.enemies.length = 0;
  var pp = stP.players[0];
  var stood = stP.platforms.map(function (pl) {
    pp.state = 'play'; pp.hp = 3; pp.invuln = 0;
    pp.x = pl.x + pl.w / 2; pp.y = pl.y - pp.h - 6; pp.vx = 0; pp.vy = 0;
    for (var i2 = 0; i2 < 40; i2++) E.step(stP, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
    return !!pp.onPlatform && Math.abs(pp.y + pp.h - pl.y) < 1.5;
  });
  ok('every deck on ' + id + ' is standable', stood.every(Boolean), { stood: stood });
});
var ride = game();
ride.enemies.length = 0;
var rp = ride.players[0];
var rpl = ride.platforms.find(function (pl) { return pl.axis === 'x'; });
rp.x = rpl.x + rpl.w / 2; rp.y = rpl.y - 40; rp.vy = 0;
stepN(ride, 40);
var rideX = rp.x, ridePlX = rpl.x;
stepN(ride, 30);
ok('a deck carries its rider along', !!rp.onPlatform && Math.abs((rp.x - rideX) - (rpl.x - ridePlX)) < 0.5,
   { moved: rp.x - rideX, deck: rpl.x - ridePlX });

/* ---- both languages ship the whole script --------------------------- */
require('../js/i18n.js');
var I18 = global.I18n;
ok('the language table loads headless', !!I18 && !!I18.dict.en && !!I18.dict.tr);
var enKeys = Object.keys(I18.dict.en).sort();
var trKeys = Object.keys(I18.dict.tr).sort();
ok('English and Turkish define the same keys',
   enKeys.length === trKeys.length && enKeys.every(function (k, i) { return k === trKeys[i]; }),
   { en: enKeys.length, tr: trKeys.length,
     missing: enKeys.filter(function (k) { return !I18.dict.tr[k]; }) });
ok('no Turkish string is blank', enKeys.every(function (k) {
  return typeof I18.dict.tr[k] === 'string' && I18.dict.tr[k].trim().length > 0;
}));
ok('Turkish is actually translated, not copied from English', enKeys.filter(function (k) {
  return I18.dict.tr[k] !== I18.dict.en[k];
}).length > 120, { changed: enKeys.filter(function (k) { return I18.dict.tr[k] !== I18.dict.en[k]; }).length });
var fs = require('fs'), pathMod = require('path');
var htmlSrc = fs.readFileSync(pathMod.join(__dirname, '..', 'index.html'), 'utf8');
var markupKeys = [];
htmlSrc.replace(/data-i18n(?:-html|-placeholder|-title|-aria)?="([^"]+)"/g, function (m, k) { markupKeys.push(k); return m; });
ok('every string in the markup exists in both languages', markupKeys.every(function (k) {
  return I18.dict.en[k] != null && I18.dict.tr[k] != null;
}), markupKeys.filter(function (k) { return I18.dict.en[k] == null || I18.dict.tr[k] == null; }));
ok('the guide art hooks point at real voxel models',
   ['stars', 'flag', 'bubble', 'lahmacun', 'baklava', 'ayran', 'sujuk',
    'icecream', 'uncle', 'grump', 'hoodlum', 'sheller'].every(function (id) {
     return htmlSrc.indexOf('data-art="' + id + '"') >= 0;
   }));
var renderSrc = fs.readFileSync(pathMod.join(__dirname, '..', 'js', 'render3d.js'), 'utf8');
var artIds = ['stars', 'flag', 'bubble', 'lahmacun', 'baklava', 'ayran', 'sujuk',
  'icecream', 'uncle', 'grump', 'hoodlum', 'sheller'];
ok('the renderer builds an icon for every guide art hook',
   artIds.every(function (id) { return renderSrc.indexOf("'" + id + "':") >= 0; }),
   artIds.filter(function (id) { return renderSrc.indexOf("'" + id + "':") < 0; }));

console.log('\n' + (checks - fails) + '/' + checks + ' checks passed');
process.exit(fails ? 1 : 0);
