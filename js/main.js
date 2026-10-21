/* main.js — boot, lobby UI, game loop and netplay glue.
 * Roles: 'solo' | 'local' | 'host' | 'guest'.
 * Characters live in fixed slots: slot 0 = S.C. (red), slot 1 = B.T. (green).
 * Picks only decide WHO CONTROLS each slot. Simulation lives in engine.js,
 * drawing lives in render3d.js. */
(function () {
  'use strict';
  var E = window.Engine, Net = window.Net, Sfx = window.Sfx, R = window.Render3D;
  var Best = window.Best;                 // local bests (js/progress.js)
  var I18n = window.I18n;                 // EN/TR strings (js/i18n.js)
  var TILE = E.TILE;

  function $(id) { return document.getElementById(id); }
  function T(k, v) { return I18n ? I18n.t(k, v) : k; }

  var canvas = $('stage');
  var renderer = (R && R.createRenderer) ? R.createRenderer(canvas) : null;
  var STEP = 1 / 60;

  var STAGE_NAMES = {};
  if (R && R.STAGES) R.STAGES.forEach(function (s) { STAGE_NAMES[s.id] = s.name; });
  function stageName(id) {
    if (I18n) { var loc = I18n.stageName(id); if (loc !== id) return loc; }
    return STAGE_NAMES[id] || 'İzmir';
  }

  /* ---------------- global ui state ---------------- */
  var view = 'menu';               // menu | lobby | game
  var role = null;                 // solo | local | host | guest
  var myPick = 'red';
  var myStage = 'izmir';
  var otherColor = function (c) { return c === 'red' ? 'green' : 'red'; };
  var colorName = function (c) { return c === 'red' ? 'S.C.' : 'B.T.'; };
  var mySlot = function () { return myPick === 'red' ? 0 : 1; };

  var state = null;                // authoritative state (solo/local/host)
  var mirror = null;               // guest render state
  var running = false;
  var net = null;
  var roomCode = null;
  var finishShown = false;
  var paused = false;

  var hostLobby = { guestIn: false, guestPick: null, guestAssigned: null, guestReady: false, myReady: false };
  var guestLobby = { hostPick: 'red', assigned: 'green', hostReady: false, myReady: false, started: false };

  var guestInput = E.EMPTY_INPUT, guestInputAt = 0;
  var lastSentInput = '', lastInputSentAt = 0;
  var prevSnap = null, curSnap = null, prevSnapAt = 0, curSnapAt = 0, lastSnapAt = 0;
  var snapCount = 0;
  var errors = [];
  window.addEventListener('error', function (e) { errors.push(String(e.message || e.error)); });

  /* ---------------- keyboard ---------------- */
  var keys = {};
  window.addEventListener('keydown', function (e) {
    if (view === 'game' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'KeyM' && view === 'game') toggleMute();
    if ((e.code === 'Escape' || e.code === 'KeyP') && view === 'game') togglePause();
    if (e.code === 'Escape' && !$('guide-modal').classList.contains('hidden')) closeGuide();
    Sfx.unlock();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () {
    keys = {};
    touchKeys = { l: false, r: false, u: false, d: false, run: false };
    var held = document.querySelectorAll('.tbtn.held');
    for (var i = 0; i < held.length; i++) held[i].classList.remove('held');
  });

  function padInput() {
    var out = { l: false, r: false, u: false, d: false, run: false };
    try {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) {
        var g = pads[i]; if (!g) continue;
        var ax = g.axes[0] || 0;
        if ((g.buttons[14] && g.buttons[14].pressed) || ax < -0.4) out.l = true;
        if ((g.buttons[15] && g.buttons[15].pressed) || ax > 0.4) out.r = true;
        if ((g.buttons[0] && g.buttons[0].pressed) || (g.buttons[12] && g.buttons[12].pressed)) out.u = true;
        if (g.buttons[13] && g.buttons[13].pressed) out.d = true;
        if ((g.buttons[2] && g.buttons[2].pressed) || (g.buttons[5] && g.buttons[5].pressed)) out.run = true;
        break;
      }
    } catch (e) { /* no gamepad */ }
    return out;
  }
  function merge(a, b) { return { l: a.l || b.l, r: a.r || b.r, u: a.u || b.u, d: a.d || b.d, run: a.run || b.run }; }
  /* held touch buttons, merged into Player 1 exactly like keys */
  var touchKeys = { l: false, r: false, u: false, d: false, run: false };

  function p1Input() {
    var k = {
      l: !!keys.ArrowLeft, r: !!keys.ArrowRight,
      u: !!keys.ArrowUp || !!keys.KeyX, d: !!keys.ArrowDown, run: !!keys.KeyZ
    };
    return merge(merge(k, padInput()), touchKeys);
  }
  function p2Input() {
    return {
      l: !!keys.KeyA, r: !!keys.KeyD,
      u: !!keys.KeyW || !!keys.KeyG, d: !!keys.KeyS, run: !!keys.KeyF
    };
  }
  function myLocalInput() { return p1Input(); }

  /* inputs array indexed by SLOT */
  function buildInputs() {
    var inputs = [E.EMPTY_INPUT, E.EMPTY_INPUT];
    if (role === 'solo') {
      inputs[mySlot()] = myLocalInput();
    } else if (role === 'local') {
      inputs[mySlot()] = p1Input();
      inputs[1 - mySlot()] = p2Input();
    } else if (role === 'host') {
      inputs[mySlot()] = myLocalInput();
      var gs = hostLobby.guestAssigned === 'red' ? 0 : 1;
      inputs[gs] = (Date.now() - guestInputAt < 600) ? guestInput : E.EMPTY_INPUT;
    }
    return inputs;
  }

  /* ---------------- touch devices ---------------- */
  /* Touch pad only for touch-first devices: a Windows laptop with a touch
   * screen also has a keyboard and a mouse, and would not want it.
   * ?touch=1 / ?touch=0 overrides the guess. */
  var isTouch = false;
  try {
    var mm = window.matchMedia;
    if (mm) {
      isTouch = mm('(pointer: coarse)').matches || mm('(hover: none)').matches;
    } else {
      isTouch = ('ontouchstart' in window) && window.innerWidth < 900;
    }
    var tq = new URLSearchParams(location.search).get('touch');
    if (tq === '1') isTouch = true;
    if (tq === '0') isTouch = false;
  } catch (e) { isTouch = false; }

  function paintTouch() {
    var pad = $('touch-pad');
    if (!pad) return;
    pad.classList.toggle('hidden', !(isTouch && view === 'game'));
  }

  /* ---------------- view switching ---------------- */
  function show(v) {
    view = v;
    $('view-menu').classList.toggle('hidden', v !== 'menu');
    $('view-lobby').classList.toggle('hidden', v !== 'lobby');
    $('view-game').classList.toggle('hidden', v !== 'game');
    last = 0;
    if (v === 'game' && renderer) renderer.resize();
    paintTouch();
  }
  function setStatus(id, msg, isErr) {
    var el = $(id); if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('error', !!isErr);
  }

  /* ---------------- pick buttons ---------------- */
  function paintPicks() {
    ['red', 'green'].forEach(function (c) {
      var a = $('pick-' + c), b = $('lobby-pick-' + c);
      if (a) { a.classList.toggle('selected', myPick === c); a.setAttribute('aria-pressed', myPick === c ? 'true' : 'false'); }
      if (b) b.classList.toggle('selected', myPick === c);
    });
  }
  function paintStage() {
    var btns = document.querySelectorAll('.stage-btn[data-stage]');
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute('data-stage');
      btns[i].classList.toggle('selected', id === myStage);
      btns[i].disabled = role === 'guest';
    }
    $('hud-stage').textContent = stageName(myStage);
    var note = $('stage-note');
    if (note) {
      if (role === 'guest') note.textContent = T('lobby.stageGuest', { stage: stageName(myStage) });
      else if (role === 'host') note.textContent = T('lobby.stageHost');
      else note.textContent = '';
    }
  }
  function setPick(c, fromNet) {
    myPick = c;
    paintPicks();
    if (role === 'host') { recomputeAssignments(); broadcastLobby(); refreshLobby(); }
    else if (role === 'guest' && net && !fromNet) net.send({ t: 'pick', pick: c });
    else if (role === 'guest') refreshLobby();
  }
  ['pick-red', 'pick-green', 'lobby-pick-red', 'lobby-pick-green'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('click', function () { setPick(this.getAttribute('data-pick')); });
  });

  /* stage buttons (menu + lobby) */
  (function () {
    var btns = document.querySelectorAll('.stage-btn[data-stage]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        if (role === 'guest') return;
        myStage = this.getAttribute('data-stage');
        paintStage();
        if (role === 'host' && net) broadcastLobby();
        updateHudStage();
      });
    }
  })();

  /* ---------------- lobby (host) ---------------- */
  function recomputeAssignments() {
    if (!hostLobby.guestIn) { hostLobby.guestAssigned = null; return; }
    var want = hostLobby.guestPick || otherColor(myPick);
    hostLobby.guestAssigned = (want === myPick) ? otherColor(myPick) : want;
  }
  function broadcastLobby() {
    if (!net) return;
    net.send({
      t: 'lobby', hostPick: myPick, guestAssigned: hostLobby.guestAssigned,
      hostReady: hostLobby.myReady, guestReady: hostLobby.guestReady, stage: myStage
    });
  }

  function refreshLobby() {
    $('lobby-code').textContent = roomCode || '-----';
    var link = location.origin + location.pathname + '?room=' + (roomCode || '') + '&autojoin=1';
    $('invite-link').value = roomCode ? link : '';
    var ul = $('player-list');
    ul.innerHTML = '';
    function row(name, color, connText, connOk, ready, readyText) {
      var li = document.createElement('li');
      var left = document.createElement('span');
      left.className = 'who';
      var cube = document.createElement('span');
      cube.className = 'mini-cube' + (color === 'green' ? ' green' : '');
      left.appendChild(cube);
      left.appendChild(document.createTextNode(name + ' · ' + colorName(color)));
      var right = document.createElement('span');
      var b1 = document.createElement('span');
      b1.className = 'badge ' + (connOk ? 'ok' : 'wait');
      b1.textContent = connText;
      var b2 = document.createElement('span');
      b2.className = 'badge ' + (ready ? 'ok' : 'wait');
      b2.textContent = readyText;
      right.appendChild(b1); right.appendChild(document.createTextNode(' ')); right.appendChild(b2);
      li.appendChild(left); li.appendChild(right);
      ul.appendChild(li);
    }
    if (role === 'host') {
      row(T('lobby.youHost'), myPick, T('badge.connected'), true,
          hostLobby.myReady, T(hostLobby.myReady ? 'badge.ready' : 'badge.notReady'));
      if (hostLobby.guestIn) {
        row(T('lobby.partner'), hostLobby.guestAssigned || 'green', T('badge.connected'), true,
            hostLobby.guestReady, T(hostLobby.guestReady ? 'badge.ready' : 'badge.notReady'));
      } else {
        row(T('lobby.partner'), 'green', T('badge.waiting'), false, false, T('badge.notReady'));
      }
      $('btn-start').disabled = !(hostLobby.guestIn && hostLobby.guestReady);
      $('btn-start').classList.toggle('hidden', false);
      $('btn-ready').textContent = T(hostLobby.myReady ? 'lobby.readyDone' : 'lobby.ready');
      $('btn-ready').classList.toggle('ready-on', hostLobby.myReady);
      var note = '';
      if (hostLobby.guestIn && hostLobby.guestPick === myPick) {
        note = T('lobby.pickClashHost', { name: colorName(myPick), other: colorName(hostLobby.guestAssigned) });
      }
      $('pick-note').textContent = note;
      setStatus('lobby-status', hostLobby.guestIn
        ? T(hostLobby.guestReady ? 'lobby.hostReady' : 'lobby.hostWaiting')
        : T('lobby.hostShare'));
    } else if (role === 'guest') {
      row(T('lobby.host'), guestLobby.hostPick, T('badge.connected'), true,
          guestLobby.hostReady, T(guestLobby.hostReady ? 'badge.ready' : 'badge.notReady'));
      row(T('lobby.you'), guestLobby.assigned, T('badge.connected'), true,
          guestLobby.myReady, T(guestLobby.myReady ? 'badge.ready' : 'badge.notReady'));
      $('btn-start').classList.add('hidden');
      $('btn-ready').textContent = T(guestLobby.myReady ? 'lobby.readyDone' : 'lobby.ready');
      $('btn-ready').classList.toggle('ready-on', guestLobby.myReady);
      var note2 = '';
      if (myPick !== guestLobby.assigned) {
        note2 = T('lobby.pickClashGuest', { name: colorName(guestLobby.hostPick), other: colorName(guestLobby.assigned) });
      }
      $('pick-note').textContent = note2;
      setStatus('lobby-status', T('lobby.guestIn'));
    }
    paintStage();
  }

  /* ---------------- pause ---------------- */
  /* Pause freezes the simulation, not just the drawing: the fixed-step
   * accumulator is dropped so resuming never fast-forwards. Online, the
   * host owns the pause and tells the guest, so both screens stop together. */
  function setPaused(v) {
    if (view !== 'game' || !running) v = false;
    paused = !!v;
    var card = $('pause-card');
    if (card) card.classList.toggle('hidden', !paused);
    var b = $('btn-pause');
    if (b) {
      b.textContent = T(paused ? 'hud.resume' : 'hud.pause');
      b.setAttribute('aria-pressed', paused ? 'true' : 'false');
    }
    var sub = $('pause-sub');
    if (sub) sub.textContent = T(paused && role === 'guest' ? 'pause.guest' : 'pause.sub');
    last = 0;
    if (!paused) lastSnapAt = Date.now();
    if (role === 'host' && net) net.send({ t: 'pause', v: paused ? 1 : 0 });
  }
  function togglePause() {
    if (view !== 'game' || !running) return;
    if (role === 'guest') return;              // the host drives the pause
    setPaused(!paused);
  }
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-resume').addEventListener('click', function () { setPaused(false); });
  $('btn-pause-leave').addEventListener('click', stopGameToMenu);

  /* ---------------- field guide ---------------- */
  function openGuide() {
    $('guide-modal').classList.remove('hidden');
    $('btn-guide-close').focus();
  }
  function closeGuide() {
    $('guide-modal').classList.add('hidden');
    $('btn-guide').focus();
  }
  $('btn-guide').addEventListener('click', openGuide);
  $('btn-guide-close').addEventListener('click', closeGuide);
  $('guide-modal').addEventListener('click', function (e) {
    if (e.target === this) closeGuide();
  });

  /* ---------------- game lifecycle ---------------- */
  function startGame() {
    if (!renderer) { setStatus('menu-status', T('menu.3dFail'), true); return; }
    finishShown = false;
    setPaused(false);
    hideOverlay();
    role = role || 'solo';
    state = E.createGame({
      mode: role === 'solo' ? 'solo' : role,
      soloColor: myPick,
      twoPlayer: role !== 'solo',
      stage: myStage
    });
    running = true;
    show('game');
    paintHudMode();
    updateHudStage();
    paintStage();
    Sfx.startMusic(myStage);
  }
  function paintHudMode() {
    $('hud-mode').textContent = role && I18n ? I18n.modeHud(role) : '';
    /* only the host can pause an online run; a guest would freeze alone */
    $('btn-pause').disabled = role === 'guest';
  }
  function updateHudStage() {
    $('hud-stage').textContent = stageName(myStage);
  }
  function stopGameToMenu() {
    running = false;
    setPaused(false);
    Sfx.stopMusic();
    if (net) { net.close(); net = null; }
    role = null; roomCode = null; state = null; mirror = null;
    prevSnap = curSnap = null;
    hostLobby = { guestIn: false, guestPick: null, guestAssigned: null, guestReady: false, myReady: false };
    guestLobby = { hostPick: 'red', assigned: 'green', hostReady: false, myReady: false, started: false };
    hideOverlay();
    show('menu');
    setStatus('menu-status', '');
    paintStage();
  }
  function showOverlay(text, showAgain) {
    $('summary').classList.add('hidden');
    $('summary-hint').classList.add('hidden');
    $('overlay-text').classList.remove('hidden');
    $('overlay-text').textContent = text;
    $('btn-again').classList.toggle('hidden', !showAgain);
    $('overlay').classList.remove('hidden');
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }

  /* ---------------- end-of-run summary ---------------- */
  function fmtTime(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60), s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtScore(n) {
    if (n == null) return '—';
    try { return Number(n).toLocaleString(I18n && I18n.lang === 'tr' ? 'tr-TR' : 'en-US'); }
    catch (e) { return String(n); }
  }

  function addStat(label, value) {
    var wrap = document.createElement('div'); wrap.className = 'stat';
    var l = document.createElement('span'); l.textContent = label;
    var b = document.createElement('b'); b.textContent = value;
    wrap.appendChild(l); wrap.appendChild(b);
    $('summary-stats').appendChild(wrap);
  }
  function addBestRow(label, value, isNew, known) {
    var row = document.createElement('div');
    row.className = 'best-row' + (known ? '' : ' none');
    var l = document.createElement('span'); l.textContent = label;
    var right = document.createElement('span');
    var b = document.createElement('b'); b.textContent = value;
    right.appendChild(b);
    if (isNew) {
      var tag = document.createElement('span'); tag.className = 'new'; tag.textContent = T('summary.new');
      right.appendChild(tag);
    }
    row.appendChild(l); row.appendChild(right);
    $('summary-best-rows').appendChild(row);
  }

  function showSummary(cfg) {
    var cleared = !!cfg.cleared;
    $('overlay-text').classList.add('hidden');
    $('overlay-text').textContent = '';
    $('summary').classList.remove('hidden');

    var kick = $('summary-kicker');
    kick.textContent = T(cleared ? 'summary.clear' : 'summary.over');
    kick.classList.toggle('over', !cleared);
    $('summary-title').textContent = cfg.stageName;
    $('summary-sub').textContent = cfg.modeName + ' · ' + T(cleared ? 'summary.reachedFlag' : 'summary.outOfLives');
    $('summary-mode').textContent = '· ' + cfg.modeName;

    $('summary-stats').innerHTML = '';
    addStat(T('summary.score'), fmtScore(cfg.st.score));
    addStat(T('summary.bananas'), String(cfg.st.coinCount));
    addStat(T(cleared ? 'summary.time' : 'summary.survived'), fmtTime(cfg.elapsedMs));
    addStat(T('summary.lives'), String(cfg.st.lives));

    $('summary-best-rows').innerHTML = '';
    addBestRow(T('summary.bestScore'), fmtScore(cfg.best.bestScore), cfg.best.newScore, cfg.best.bestScore != null);
    addBestRow(T('summary.bestTime'), fmtTime(cfg.best.bestTimeMs), cfg.best.newTime, cfg.best.bestTimeMs != null);

    var hint = $('summary-hint');
    hint.classList.remove('hidden');
    if (cfg.best.bestScore == null) hint.textContent = T('summary.noStorage');
    else if (!cfg.showAgain) hint.textContent = T('summary.waitingHost');
    else if (cfg.best.newTime) hint.textContent = T('summary.newTime');
    else if (cfg.best.newScore && cleared) hint.textContent = T('summary.newScoreClear');
    else if (cfg.best.newScore) hint.textContent = T('summary.newScore');
    else if (cleared) hint.textContent = T('summary.playToBeat');
    else hint.textContent = T('summary.target', { n: fmtScore(cfg.best.bestScore + 1) });

    $('btn-again').classList.toggle('hidden', !cfg.showAgain);
    $('overlay').classList.remove('hidden');
  }

  function submitRun(st, cleared) {
    var elapsedMs = Math.round((st.runTicks || 0) * 1000 / 60);
    /* progress.js may be missing (blocked script); the summary still shows
     * the run itself, just without records */
    if (!Best) {
      return {
        bestScore: null, bestTimeMs: null, newScore: false, newTime: false,
        modeName: I18n ? I18n.modeName(role) : (role === 'solo' ? 'Solo' : role === 'local' ? 'Local 2P' : 'Online co-op'),
        elapsedMs: elapsedMs
      };
    }
    var best = Best.submit(st.stage || myStage, role, { score: st.score, cleared: cleared, timeMs: elapsedMs });
    best.elapsedMs = elapsedMs;
    best.modeName = I18n ? I18n.modeName(role) : best.modeName;
    return best;
  }

  /* ---------------- language switch ---------------- */
  function repaintText() {
    setStatus('menu-status', '');
    setStatus('lobby-status', '');
    setStatus('game-status', '');
    paintPicks();
    paintStage();
    paintHudMode();
    updateHudStage();
    paintSound();
    var pb = $('btn-pause');
    if (pb) pb.textContent = T(paused ? 'hud.resume' : 'hud.pause');
    var gb = $('btn-guide');
    if (gb) gb.textContent = T('guide.open');
    if (role && view === 'lobby') refreshLobby();
  }
  (function () {
    var btns = document.querySelectorAll('.lang-switch [data-lang]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        if (!I18n) return;
        I18n.setLang(this.getAttribute('data-lang'));
        repaintText();
      });
    }
  })();

  /* menu buttons */
  $('btn-solo').addEventListener('click', function () { role = 'solo'; startGame(); });
  $('btn-local').addEventListener('click', function () { role = 'local'; startGame(); });
  $('btn-leave-game').addEventListener('click', stopGameToMenu);
  $('btn-overlay-leave').addEventListener('click', stopGameToMenu);
  $('btn-leave-lobby').addEventListener('click', stopGameToMenu);
  $('btn-again').addEventListener('click', function () {
    if (role === 'guest') return;                 // host drives restarts
    startGame();
    if (role === 'host' && net) net.send({ t: 'start', hostPick: myPick, guestAssigned: hostLobby.guestAssigned, stage: myStage });
  });
  $('btn-copy').addEventListener('click', function () {
    var inp = $('invite-link');
    inp.select();
    var done = function () { setStatus('lobby-status', T('lobby.copied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inp.value).then(done, function () { document.execCommand('copy'); done(); });
    } else { document.execCommand('copy'); done(); }
  });
  /* ---------------- sound: mute + volume, remembered locally ---------------- */
  var VOL_KEY = 'leapbuddies.volume.v1', MUTE_KEY = 'leapbuddies.muted.v1';
  function savePref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* blocked */ } }
  function loadAudioPrefs() {
    try {
      var v = parseFloat(localStorage.getItem(VOL_KEY));
      if (isFinite(v)) Sfx.setVolume(v);
      if (localStorage.getItem(MUTE_KEY) === '1') Sfx.setMuted(true);
    } catch (e) { /* blocked */ }
  }
  function isSilent() { return Sfx.isMuted() || Sfx.getVolume() <= 0; }
  function paintSound() {
    var silent = isSilent();
    $('btn-mute').textContent = T(silent ? 'hud.soundOff' : 'hud.soundOn');
    $('btn-mute').setAttribute('aria-pressed', silent ? 'true' : 'false');
    var vol = $('vol');
    if (vol && document.activeElement !== vol) vol.value = Math.round(Sfx.getVolume() * 100);
  }
  /* one button for the whole sound state: from silence it restores a level,
   * from sound it mutes. A slider at 0 counts as silence, not "on". */
  function toggleMute() {
    if (isSilent()) {
      if (Sfx.getVolume() <= 0) { Sfx.setVolume(0.8); savePref(VOL_KEY, 0.8); }
      Sfx.setMuted(false);
    } else {
      Sfx.setMuted(true);
    }
    savePref(MUTE_KEY, Sfx.isMuted() ? 1 : 0);
    paintSound();
  }
  $('btn-mute').addEventListener('click', toggleMute);

  /* ---------------- touch pad ---------------- */
  (function () {
    var btns = document.querySelectorAll('.tbtn[data-touch]');
    function release(btn, act, e) {
      if (e && e.cancelable) e.preventDefault();
      touchKeys[act] = false;
      btn.classList.remove('held');
    }
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        var act = btn.getAttribute('data-touch');
        btn.addEventListener('pointerdown', function (e) {
          if (e.cancelable) e.preventDefault();
          touchKeys[act] = true;
          btn.classList.add('held');
          if (btn.setPointerCapture && e.pointerId != null) {
            try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          }
          Sfx.unlock();
        });
        ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach(function (t) {
          btn.addEventListener(t, function (e) { release(btn, act, e); });
        });
        btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      })(btns[i]);
    }
  })();
  $('vol').addEventListener('input', function () {
    var v = Number(this.value) / 100;
    Sfx.setVolume(v);
    savePref(VOL_KEY, v);
    if (v > 0 && Sfx.isMuted()) { Sfx.setMuted(false); savePref(MUTE_KEY, 0); }
    Sfx.unlock();
    paintSound();
  });
  $('vol').addEventListener('change', function () { savePref(VOL_KEY, Sfx.getVolume()); });

  /* ---------------- online: host ---------------- */
  $('btn-create').addEventListener('click', function () {
    if (!Net.libReady()) { setStatus('menu-status', T('menu.netFail'), true); return; }
    role = 'host';
    roomCode = Net.makeCode();
    setStatus('menu-status', T('menu.creating'));
    net = Net.host(roomCode, {
      onOpen: function () { show('lobby'); refreshLobby(); },
      onGuest: function () {
        hostLobby.guestIn = true; hostLobby.guestReady = false;
        recomputeAssignments(); broadcastLobby(); refreshLobby();
      },
      onData: function (d) { hostOnData(d); },
      onClose: function () { hostGuestGone(); },
      onError: function (msg) {
        setStatus('menu-status', msg, true);
        if (view !== 'game') { role = null; net = null; }
      }
    });
    if (!net) { role = null; setStatus('menu-status', T('menu.createFail'), true); }
  });
  function hostGuestGone() {
    if (role !== 'host') return;
    if (view === 'game' && running) {
      running = false;
      showOverlay(T('game.partnerDisconnected'), false);
    } else if (view === 'lobby') {
      hostLobby.guestIn = false; hostLobby.guestReady = false;
      recomputeAssignments(); refreshLobby();
      setStatus('lobby-status', T('game.partnerLeft'), true);
    }
  }
  function hostOnData(d) {
    if (!d || !d.t) return;
    if (d.t === 'hello' || d.t === 'pick') {
      hostLobby.guestPick = d.pick;
      hostLobby.guestIn = true;
      recomputeAssignments(); broadcastLobby(); refreshLobby();
    } else if (d.t === 'ready') {
      hostLobby.guestReady = !!d.v;
      broadcastLobby(); refreshLobby();
    } else if (d.t === 'input') {
      guestInput = d.i || E.EMPTY_INPUT;
      guestInputAt = Date.now();
    }
  }
  $('btn-start').addEventListener('click', function () {
    if (role !== 'host') return;
    startGame();
    net.send({ t: 'start', hostPick: myPick, guestAssigned: hostLobby.guestAssigned, stage: myStage });
  });

  /* ---------------- online: guest ---------------- */
  function joinRoom(code) {
    code = (code || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{5}$/.test(code)) { setStatus('menu-status', T('menu.needCode'), true); return; }
    if (!Net.libReady()) { setStatus('menu-status', T('menu.joinNoLib'), true); return; }
    role = 'guest';
    roomCode = code;
    guestLobby.assigned = otherColor(myPick); // provisional until host assigns
    setStatus('menu-status', T('menu.joining', { code: code }));
    var opened = false;
    var joinTimer = setTimeout(function () {
      if (!opened && role === 'guest') {
        setStatus('menu-status', T('menu.joinStuck'), true);
      }
    }, 15000);
    net = Net.join(code, {
      onOpen: function () {
        opened = true;
        clearTimeout(joinTimer);
        net.send({ t: 'hello', pick: myPick });
        show('lobby'); refreshLobby();
      },
      onData: function (d) { guestOnData(d); },
      onClose: function () {
        if (role !== 'guest') return;
        if (view === 'game' && (running || guestLobby.started)) {
          running = false;
          showOverlay(T('game.connectionLost'), false);
        } else if (view === 'lobby') {
          setStatus('menu-status', T('lobby.hostLeft'), true);
          stopGameToMenu();
        }
      },
      onError: function (msg) {
        if (!opened) { setStatus('menu-status', msg, true); role = null; net = null; show('menu'); }
        else setStatus('game-status', msg, true);
      }
    });
    if (!net) role = null;
  }
  $('btn-join').addEventListener('click', function () { joinRoom($('join-code').value); });
  $('join-code').addEventListener('keydown', function (e) {
    if (e.code === 'Enter') joinRoom(this.value);
  });
  function guestOnData(d) {
    if (!d || !d.t) return;
    if (d.t === 'lobby') {
      guestLobby.hostPick = d.hostPick;
      if (d.guestAssigned) guestLobby.assigned = d.guestAssigned;
      guestLobby.hostReady = !!d.hostReady;
      if (d.stage) { myStage = d.stage; updateHudStage(); }
      if (view === 'lobby') refreshLobby();
    } else if (d.t === 'start') {
      guestLobby.started = true;
      finishShown = false;
      if (d.guestAssigned) { guestLobby.assigned = d.guestAssigned; myPick = d.guestAssigned; paintPicks(); }
      if (d.stage) { myStage = d.stage; }
      mirror = E.createGame({ mode: 'guest', twoPlayer: true, stage: myStage });
      prevSnap = curSnap = null; snapCount = 0;
      running = true;
      hideOverlay();
      show('game'); paintHudMode(); updateHudStage(); paintStage();
      Sfx.startMusic(myStage);
    } else if (d.t === 'pause') {
      paused = !!d.v;
      $('pause-card').classList.toggle('hidden', !paused);
      $('pause-sub').textContent = T('pause.guest');
      $('btn-pause').textContent = T(paused ? 'hud.resume' : 'hud.pause');
      $('btn-pause').setAttribute('aria-pressed', paused ? 'true' : 'false');
      if (!paused) lastSnapAt = Date.now();
    } else if (d.t === 'snap') {
      lastSnapAt = Date.now();
      prevSnap = curSnap; prevSnapAt = curSnapAt;
      curSnap = d.s; curSnapAt = Date.now();
      snapCount++;
      if (mirror && curSnap) E.applySnapshot(mirror, curSnap);
    }
  }
  $('btn-ready').addEventListener('click', function () {
    if (role === 'host') {
      hostLobby.myReady = !hostLobby.myReady;
      broadcastLobby(); refreshLobby();
    } else if (role === 'guest') {
      guestLobby.myReady = !guestLobby.myReady;
      if (net) net.send({ t: 'ready', v: guestLobby.myReady });
      refreshLobby();
    }
  });

  /* auto-join from invite link */
  (function () {
    var q = new URLSearchParams(location.search);
    var room = q.get('room');
    if (room) {
      $('join-code').value = room.toUpperCase();
      if (q.get('autojoin') === '1') {
        setStatus('menu-status', T('menu.joining', { code: room.toUpperCase() }));
        joinRoom(room);
      } else {
        setStatus('menu-status', T('menu.invited', { code: room.toUpperCase() }));
      }
    }
  })();

  /* ---------------- fixed-timestep loop ---------------- */
  var last = 0, acc = 0;
  var fpsFrames = 0, fpsTime = 0, fps = 0, costMs = 0;

  function frame(ts) {
    requestAnimationFrame(frame);
    var t0 = performance.now();
    tick(ts);
    costMs += (performance.now() - t0 - costMs) * 0.08;   // rolling JS cost/frame
  }

  function tick(ts) {
    if (document.hidden) { last = 0; return; }      // paused while hidden
    if (!last) { last = ts; if (view === 'game' && renderer) renderer.resize(); }
    var dt = Math.min(0.2, (ts - last) / 1000);
    last = ts;
    if (dt > 0) {
      fpsFrames++; fpsTime += dt;
      if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
    }

    if (view !== 'game') {                           // menus: animate the 3D cards only
      if (R && R.previewTick) R.previewTick(ts);
      return;
    }
    if (!renderer) return;

    if (role === 'guest') { guestFrame(ts, dt); return; }
    if (!running || !state) return;
    if (paused) {
      renderer.draw(state, { dt: 0, mine: mySlot() });
      updateHud(state);
      return;
    }

    acc += dt;
    var steps = 0;
    while (acc >= STEP && steps < 5) {
      E.step(state, buildInputs());
      drainEvents(state);
      acc -= STEP; steps++;
      if (role === 'host' && net && state.tick % 3 === 0) {
        net.send({ t: 'snap', s: E.makeSnapshot(state) });
      }
      if (state.finished) { onFinished(state); break; }
      if (state.gameOver) { onGameOver(state); break; }
    }
    renderer.draw(state, { dt: dt, mine: mySlot() });
    updateHud(state);
  }

  function guestFrame(ts, dt) {
    // send my inputs at ~30Hz or on change
    var inp = myLocalInput();
    var key = [inp.l, inp.r, inp.u, inp.d, inp.run].map(Number).join('');
    if (net && (key !== lastSentInput || ts - lastInputSentAt > 120)) {
      net.send({ t: 'input', i: inp });
      lastSentInput = key; lastInputSentAt = ts;
    }
    if (!running || !mirror || !curSnap) return;
    if (paused) {
      renderer.draw(mirror, { dt: 0, mine: mySlot() });
      updateHud(mirror);
      return;
    }

    // render one snapshot behind, interpolating up to the newest one
    var alpha = 1;
    if (prevSnap && curSnap && curSnapAt > prevSnapAt) {
      alpha = (ts - prevSnapAt) / Math.max(1, curSnapAt - prevSnapAt);
      alpha = Math.max(0, Math.min(1.08, alpha));
    }
    renderer.draw(mirror, { dt: dt, alpha: alpha, prev: prevSnap, mine: mySlot() });
    updateHud(mirror);
    if (mirror.gameOver) onGameOver(mirror);
    else if (mirror.finished) onFinished(mirror);
    if (Date.now() - lastSnapAt > 4000 && running) {
      running = false;
      showOverlay(T('game.connectionLost'), false);
    }
  }
  requestAnimationFrame(frame);

  function onGameOver(st) {
    if (finishShown) return;
    finishShown = true;
    Sfx.play('gameover');
    var best = submitRun(st, false);
    showSummary({
      cleared: false, stageName: stageName(st.stage || myStage), modeName: best.modeName,
      st: st, elapsedMs: best.elapsedMs, best: best, showAgain: role !== 'guest'
    });
    if (role === 'guest') setStatus('game-status', T('game.outOfLives'));
  }

  function onFinished(st) {
    if (finishShown) return;
    finishShown = true;
    Sfx.play('goal');
    var best = submitRun(st, true);
    showSummary({
      cleared: true, stageName: stageName(st.stage || myStage), modeName: best.modeName,
      st: st, elapsedMs: best.elapsedMs, best: best, showAgain: role !== 'guest'
    });
    if (role === 'guest') setStatus('game-status', T('game.waitingRestart'));
  }

  function drainEvents(st) {
    for (var i = 0; i < st.events.length; i++) {
      var e = st.events[i];
      if (e === 'break') Sfx.play('brk');
      else if (e === 'goal') { /* handled by onFinished */ }
      else Sfx.play(e);
    }
    st.events.length = 0;
  }

  function paintHearts(el, p) {
    if (!el) return;
    if (!p || p.absent) { el.hidden = true; return; }
    el.hidden = false;
    var hearts = Math.max(0, Math.min(3, typeof p.hp === 'number' ? p.hp : 3));
    el.querySelector('.hearts').textContent =
      '\u2605\u2605\u2605'.slice(0, hearts) + '\u2606\u2606\u2606'.slice(0, 3 - hearts);
    el.classList.toggle('powered', !!p.big);
    el.classList.toggle('starred', (p.star || 0) > 0);
    el.classList.toggle('low', hearts <= 1);
    el.setAttribute('aria-label', (p.color === 'green' ? 'B.T.' : 'S.C.') + ' ' + hearts + '/3');
  }

  function updateHud(st) {
    $('hud-coins').textContent = st.coinCount;
    $('hud-score').textContent = st.score;
    $('hud-time').textContent = Math.max(0, Math.ceil(st.timeLeft / 60));
    var red = null, green = null;
    for (var i = 0; i < st.players.length; i++) {
      var p = st.players[i];
      if (p.color === 'red') red = p;
      else if (p.color === 'green') green = p;
    }
    paintHearts($('hud-hearts-red'), red);
    paintHearts($('hud-hearts-green'), green);
    $('hud-lives').textContent = st.lives;
    $('hud-lives-chip').classList.toggle('low', st.lives <= 1);
  }

  window.addEventListener('resize', function () { if (view === 'game' && renderer) renderer.resize(); });

  /* ---------------- test hooks (used by automated checks) ---------------- */
  window.__game = {
    get state() { return state; },
    get mirror() { return mirror; },
    get role() { return role; },
    get running() { return running; },
    get roomCode() { return roomCode; },
    get snapCount() { return snapCount; },
    get paused() { return paused; },
    clock: function () { return { last: last, acc: acc }; },
    get guideOpen() { return !$('guide-modal').classList.contains('hidden'); },
    get errors() { return errors; },
    get fps() { return fps; },
    get cost() { return Math.round(costMs * 100) / 100; },
    get stage() { return myStage; },
    get lobby() { return role === 'host' ? hostLobby : guestLobby; },
    setPick: setPick,
    setPaused: setPaused,
    togglePause: togglePause,
    openGuide: openGuide,
    closeGuide: closeGuide,
    setStage: function (id) { myStage = id; paintStage(); if (role === 'host') broadcastLobby(); },
    startSolo: function () { role = 'solo'; startGame(); },
    startLocal: function () { role = 'local'; startGame(); },
    createRoom: function () { $('btn-create').click(); },
    joinRoom: joinRoom,
    ready: function () { $('btn-ready').click(); },
    startHost: function () { $('btn-start').click(); },
    pressKey: function (code, down) {
      var t = down ? 'keydown' : 'keyup';
      window.dispatchEvent(new KeyboardEvent(t, { code: code }));
    },
    stats: function () { return renderer ? renderer.stats() : null; },
    dbg: function () { return renderer ? renderer._dbg : null; },
    /* draw one frame with a chosen delta; used by automated checks when the
     * browser throttles requestAnimationFrame (hidden or occluded tab) */
    drawFrame: function (dt) {
      var st = role === 'guest' ? mirror : state;
      if (renderer && st) renderer.draw(st, { dt: dt == null ? 1 / 60 : dt, mine: mySlot() });
    },
    /* run one full loop tick with a chosen timestamp (same path as rAF) */
    tickWith: function (ts) { tick(ts); },
    guestState: function () {
      if (!mirror) return null;
      return {
        tick: mirror.tick, coins: mirror.coinCount, finished: mirror.finished,
        players: mirror.players.map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y), color: p.color, state: p.state }; })
      };
    },
    hostState: function () {
      if (!state) return null;
      return {
        tick: state.tick, coins: state.coinCount, finished: state.finished,
        players: state.players.map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y), color: p.color, state: p.state }; })
      };
    }
  };

  if (!renderer) {
    setStatus('menu-status', T('menu.3dFail'), true);
  }

  /* language first so every later repaint uses the chosen one */
  if (I18n) I18n.apply();
  loadAudioPrefs();
  paintSound();
  document.documentElement.classList.toggle('touch', !!isTouch);
  show('menu');
  paintPicks();
  paintStage();
  /* browsers only allow audio after a gesture */
  window.addEventListener('pointerdown', function once() {
    Sfx.unlock();
    window.removeEventListener('pointerdown', once);
  }, { once: true });
})();
