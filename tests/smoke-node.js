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

/* ---- the level itself is unchanged ---- */
var lvl = E.buildLevel();
ok('level is 200 x 18', lvl.w === 200 && lvl.h === 18, { w: lvl.w, h: lvl.h });
ok('64 bananas in the level', lvl.coins.length === 64, { n: lvl.coins.length });
ok('10 critters', lvl.enemies.length === 10);
ok('3 moving platforms', lvl.platforms.length === 3);
ok('2 floor switches + gate at x=70', lvl.switches.length === 2 && lvl.gateTx === 70);

/* ---- run / skid / jump basics ---- */
var st = game();
st.enemies.length = 0;                 // isolate movement from critters
var p = findPlayer(st, 'red');
stepN(st, 40);
ok('player settles on the ground', Math.abs(p.y - 218) < 1.5, { y: p.y });
var x0 = p.x;
stepN(st, 60, [{ l: false, r: true, u: false, d: false, run: false }, E.EMPTY_INPUT]);
ok('holds right without running', p.x > x0 + 30, { x0: x0, x: p.x });
var x1 = p.x;
stepN(st, 60, [{ l: false, r: true, u: false, d: false, run: true }, E.EMPTY_INPUT]);
ok('run is faster', p.x - x1 > 90, { moved: p.x - x1 });

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
st7.enemies.push({ type: 'walker', x: p7.x, y: p7.y, w: 14, h: 12, vx: 0, vy: 0, dir: 1, state: 'walk', timer: 0, dead: false, onGround: true });
E.step(st7, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('a hit drops the power state instead of knocking out', p7.big === false && p7.state === 'play', { big: p7.big, state: p7.state });

/* ---- checkpoint + goal ---- */
var st8 = game();
var p8 = findPlayer(st8, 'red');
st8.camX = 1300;
p8.x = 92 * TILE + 20; p8.y = 218;
E.step(st8, [E.EMPTY_INPUT, E.EMPTY_INPUT]);
ok('midpoint sets the checkpoint', st8.midReached === true && st8.checkpoint.x === 92 * TILE);

st8.camX = 2600;
p8.x = 176 * TILE + 4; p8.y = 9 * TILE - 30;
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
ok('solo enemy hit costs a life, never a bubble', stH.lives === 2 && h0.state === 'ko', { lives: stH.lives, state: h0.state });
stepN(stH, 50);
ok('solo comes back from a hit at the checkpoint', h0.state === 'play' && stH.lives === 2, { state: h0.state });

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

/* ---- stages are labels only: same verified layout everywhere ---- */
['izmir', 'nyc', 'istanbul', 'tampa'].forEach(function (id) {
  var s = E.createGame({ mode: 'solo', soloColor: 'red', twoPlayer: false, stage: id });
  ok('stage theme ' + id + ' keeps the same layout', JSON.stringify(s.tiles) === JSON.stringify(lvl.tiles));
});

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
var terrace = cm.enemies.filter(function (e) { return e.x > 113 * TILE && e.x < 133 * TILE; });
ok('the high-terrace pair spawns above the terrace block', terrace.length === 2, { n: terrace.length });
stepN(cm, 30);
ok('terrace critters land on the terrace top, not inside it', terrace.every(function (e) {
  return Math.abs(e.y + e.h - 11 * TILE) < 0.6 && !inTerrain(cm, e);
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

/* ---- stomp -> shell -> kick keeps the shell silhouette ---- */
var sh = game();
sh.enemies.length = 0;
var sheller = { type: 'sheller', x: 30 * TILE, y: 240 - 14, w: 14, h: 14, vx: -0.4, vy: 0, dir: -1, state: 'walk', timer: 0, dead: false, onGround: true };
sh.enemies.push(sheller);
var sp = findPlayer(sh, 'red');
sp.x = sheller.x + 2; sp.y = sheller.y - sp.h + 1; sp.vy = 3; sp.invuln = 0;
stepN(sh, 1);
ok('stomping a sheller turns it into a shell', sheller.state === 'shell' && !sheller.dead, { state: sheller.state });
ok('the shell is a low body, not a full critter', sheller.h === 10, { h: sheller.h });
sp.state = 'play'; sp.invuln = 0; sp.vy = 0;
sp.x = sheller.x - 8; sp.y = sheller.y;
stepN(sh, 1);
ok('touching a shell kicks it sliding', sheller.state === 'slide' && sheller.vx > 1, { state: sheller.state, vx: sheller.vx });
ok('a sliding shell keeps the shell body (no pop back to a full sprite)', sheller.h === 10, { h: sheller.h });

var sh2 = game();
sh2.enemies.length = 0;
var wallShell = { type: 'sheller', x: 70 * TILE - 16, y: 240 - 10, w: 14, h: 10, vx: 3.3, vy: 0, dir: 1, state: 'slide', timer: 0, dead: false, onGround: true };
sh2.enemies.push(wallShell);
stepN(sh2, 2);
ok('a sliding shell bounces off a wall instead of vanishing into it', wallShell.vx < 0 && !!wallShell, { vx: wallShell.vx });
ok('the wall-bounced shell is still a shell', wallShell.h === 10 && !inTerrain(sh2, wallShell), { h: wallShell.h });

var sh3 = game();
sh3.enemies.length = 0;
var restShell = { type: 'sheller', x: 20 * TILE, y: 240 - 10, w: 14, h: 10, vx: 0, vy: 0, dir: 1, state: 'shell', timer: 0, dead: false, onGround: true };
sh3.enemies.push(restShell);
stepN(sh3, 500);
ok('a kicked-out shell wakes up and walks again', restShell.state === 'walk' && restShell.h === 14, { state: restShell.state, h: restShell.h });

console.log('\n' + (checks - fails) + '/' + checks + ' checks passed');
process.exit(fails ? 1 : 0);
