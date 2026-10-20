/* main.js — boot, lobby UI, game loop, rendering, netplay glue.
 * Roles: 'solo' | 'local' | 'host' | 'guest'.
 * Characters live in fixed slots: slot 0 = Red, slot 1 = Green.
 * Picks only decide WHO CONTROLS each slot. */
(function () {
  'use strict';
  var E = window.Engine, S = window.Sprites, Net = window.Net, Sfx = window.Sfx;
  var TILE = E.TILE, VIEW_W = E.VIEW_W, VIEW_H = E.VIEW_H;

  function $(id) { return document.getElementById(id); }
  var canvas = $('stage'), ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  /* ---------------- global ui state ---------------- */
  var view = 'menu';               // menu | lobby | game
  var role = null;                 // solo | local | host | guest
  var myPick = 'red';
  var otherColor = function (c) { return c === 'red' ? 'green' : 'red'; };
  var mySlot = function () { return myPick === 'red' ? 0 : 1; };

  var state = null;                // authoritative state (solo/local/host)
  var mirror = null;               // guest render state
  var running = false;
  var net = null;
  var roomCode = null;

  // host lobby state
  var hostLobby = { guestIn: false, guestPick: null, guestAssigned: null, guestReady: false, myReady: false };
  // guest lobby state (mirrors host broadcasts)
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
    if (e.code === 'KeyM') toggleMute();
    Sfx.unlock();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });

  function padInput() {
    var out = { l: false, r: false, u: false, d: false, run: false };
    try {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) {
        var g = pads[i]; if (!g) continue;
        var ax = g.axes[0] || 0;
        if (g.buttons[14] && g.buttons[14].pressed || ax < -0.4) out.l = true;
        if (g.buttons[15] && g.buttons[15].pressed || ax > 0.4) out.r = true;
        if ((g.buttons[0] && g.buttons[0].pressed) || (g.buttons[12] && g.buttons[12].pressed)) out.u = true;
        if (g.buttons[13] && g.buttons[13].pressed) out.d = true;
        if ((g.buttons[2] && g.buttons[2].pressed) || (g.buttons[5] && g.buttons[5].pressed)) out.run = true;
        break;
      }
    } catch (e) { /* no gamepad */ }
    return out;
  }
  function merge(a, b) { return { l: a.l || b.l, r: a.r || b.r, u: a.u || b.u, d: a.d || b.d, run: a.run || b.run }; }
  function p1Input() {
    var k = {
      l: !!keys.ArrowLeft, r: !!keys.ArrowRight,
      u: !!keys.ArrowUp || !!keys.KeyX, d: !!keys.ArrowDown, run: !!keys.KeyZ
    };
    return merge(k, padInput());
  }
  function p2Input() {
    return {
      l: !!keys.KeyA, r: !!keys.KeyD,
      u: !!keys.KeyW || !!keys.KeyG, d: !!keys.KeyS, run: !!keys.KeyF
    };
  }
  function myLocalInput() { return role === 'local' ? p1Input() : p1Input(); }

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

  /* ---------------- view switching ---------------- */
  function show(v) {
    view = v;
    $('view-menu').classList.toggle('hidden', v !== 'menu');
    $('view-lobby').classList.toggle('hidden', v !== 'lobby');
    $('view-game').classList.toggle('hidden', v !== 'game');
  }
  function setStatus(id, msg, isErr) {
    var el = $(id); if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('error', !!isErr);
  }

  /* ---------------- pick buttons ---------------- */
  function paintPicks() {
    ['red', 'green'].forEach(function (c) {
      $('pick-' + c).classList.toggle('selected', myPick === c);
      var lb = $('lobby-pick-' + c);
      if (lb) lb.classList.toggle('selected', myPick === c);
    });
  }
  function setPick(c, fromNet) {
    myPick = c;
    paintPicks();
    if (role === 'host') { recomputeAssignments(); broadcastLobby(); refreshLobby(); }
    else if (role === 'guest' && net && !fromNet) net.send({ t: 'pick', pick: c });
    else if (role === 'guest') refreshLobby();
  }
  ['pick-red', 'pick-green', 'lobby-pick-red', 'lobby-pick-green'].forEach(function (id) {
    $(id).addEventListener('click', function () { setPick(this.getAttribute('data-pick')); });
  });

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
      hostReady: hostLobby.myReady, guestReady: hostLobby.guestReady
    });
  }
  function lobbyDataForGuest() { /* guest uses guestLobby */ }

  function refreshLobby() {
    $('lobby-code').textContent = roomCode || '-----';
    var link = location.origin + location.pathname + '?room=' + (roomCode || '');
    $('invite-link').value = roomCode ? link : '';
    var ul = $('player-list');
    ul.innerHTML = '';
    function row(name, color, connText, connOk, ready, readyText) {
      var li = document.createElement('li');
      var left = document.createElement('span');
      left.innerHTML = '<span class="dot dot-' + color + '"></span> ' + name;
      left.style.display = 'inline-flex'; left.style.gap = '8px'; left.style.alignItems = 'center';
      var right = document.createElement('span');
      var b1 = document.createElement('span'); b1.className = 'badge ' + (connOk ? 'ok' : 'wait'); b1.textContent = connText;
      var b2 = document.createElement('span'); b2.className = 'badge ' + (ready ? 'ok' : 'wait'); b2.textContent = readyText;
      right.appendChild(b1); right.appendChild(document.createTextNode(' ')); right.appendChild(b2);
      li.appendChild(left); li.appendChild(right);
      ul.appendChild(li);
    }
    if (role === 'host') {
      row('You (host)', myPick, 'connected', true, hostLobby.myReady, hostLobby.myReady ? 'ready' : 'not ready');
      if (hostLobby.guestIn) {
        row('Partner', hostLobby.guestAssigned || 'green', 'connected', true,
            hostLobby.guestReady, hostLobby.guestReady ? 'ready' : 'not ready');
      } else {
        row('Partner', 'green', 'waiting to join…', false, false, 'not ready');
      }
      $('btn-start').disabled = !(hostLobby.guestIn && hostLobby.guestReady);
      $('btn-start').classList.toggle('hidden', false);
      $('btn-ready').textContent = hostLobby.myReady ? 'Ready ✓' : 'Ready';
      $('btn-ready').classList.toggle('ready-on', hostLobby.myReady);
      var note = '';
      if (hostLobby.guestIn && hostLobby.guestPick === myPick) {
        note = 'You both picked ' + myPick + ' — partner will play ' + (hostLobby.guestAssigned || '') + '.';
      }
      $('pick-note').textContent = note;
      setStatus('lobby-status', hostLobby.guestIn
        ? (hostLobby.guestReady ? 'Partner is ready — hit Start!' : 'Partner joined. Waiting for them to ready up…')
        : 'Share the code or invite link with your partner.');
    } else if (role === 'guest') {
      row('Host', guestLobby.hostPick, 'connected', true, guestLobby.hostReady, guestLobby.hostReady ? 'ready' : 'not ready');
      row('You', guestLobby.assigned, 'connected', true, guestLobby.myReady, guestLobby.myReady ? 'ready' : 'not ready');
      $('btn-start').classList.add('hidden');
      $('btn-ready').textContent = guestLobby.myReady ? 'Ready ✓' : 'Ready';
      $('btn-ready').classList.toggle('ready-on', guestLobby.myReady);
      var note2 = '';
      if (myPick !== guestLobby.assigned) {
        note2 = 'Host picked ' + guestLobby.hostPick + ' too — you will play ' + guestLobby.assigned + '.';
      }
      $('pick-note').textContent = note2;
      setStatus('lobby-status', 'You are in. Pick your character and ready up — the host starts the game.');
    }
  }

  /* ---------------- game lifecycle ---------------- */
  function startGame() {
    hideOverlay();
    if (role === 'solo') state = E.createGame({ mode: 'solo', soloColor: myPick, twoPlayer: false });
    else state = E.createGame({ mode: role, twoPlayer: true });
    running = true;
    show('game');
    paintHudMode();
    Sfx.startMusic();
  }
  function paintHudMode() {
    var label = { solo: 'SOLO', local: 'LOCAL 2P', host: 'ONLINE — HOST', guest: 'ONLINE — GUEST' }[role] || '';
    $('hud-mode').textContent = label;
  }
  function stopGameToMenu() {
    running = false;
    Sfx.stopMusic();
    if (net) { net.close(); net = null; }
    role = null; roomCode = null; state = null; mirror = null;
    prevSnap = curSnap = null;
    hostLobby = { guestIn: false, guestPick: null, guestAssigned: null, guestReady: false, myReady: false };
    guestLobby = { hostPick: 'red', assigned: 'green', hostReady: false, myReady: false, started: false };
    hideOverlay();
    show('menu');
    setStatus('menu-status', '');
  }
  function showOverlay(text, showAgain) {
    $('overlay-text').textContent = text;
    $('btn-again').classList.toggle('hidden', !showAgain);
    $('overlay').classList.remove('hidden');
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }

  /* menu buttons */
  $('btn-solo').addEventListener('click', function () { role = 'solo'; startGame(); });
  $('btn-local').addEventListener('click', function () { role = 'local'; startGame(); });
  $('btn-leave-game').addEventListener('click', stopGameToMenu);
  $('btn-overlay-leave').addEventListener('click', stopGameToMenu);
  $('btn-leave-lobby').addEventListener('click', stopGameToMenu);
  $('btn-again').addEventListener('click', function () {
    if (role === 'guest') return; // host drives restarts
    startGame();
    if (role === 'host' && net) net.send({ t: 'start', hostPick: myPick, guestAssigned: hostLobby.guestAssigned });
  });
  $('btn-copy').addEventListener('click', function () {
    var inp = $('invite-link'); inp.select();
    var done = function () { setStatus('lobby-status', 'Invite link copied — send it to your partner.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inp.value).then(done, function () { document.execCommand('copy'); done(); });
    } else { document.execCommand('copy'); done(); }
  });
  function toggleMute() {
    var m = !Sfx.isMuted();
    Sfx.setMuted(m);
    $('btn-mute').textContent = m ? 'Sound: off' : 'Sound: on';
  }
  $('btn-mute').addEventListener('click', toggleMute);

  /* ---------------- online: host ---------------- */
  $('btn-create').addEventListener('click', function () {
    if (!Net.libReady()) { setStatus('menu-status', 'Netplay library failed to load — check your connection and refresh. Solo and Local 2P still work.', true); return; }
    role = 'host';
    roomCode = Net.makeCode();
    setStatus('menu-status', 'Creating room…');
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
    if (!net) { role = null; setStatus('menu-status', 'Could not create a room.', true); }
  });
  function hostGuestGone() {
    if (role !== 'host') return;
    if (view === 'game' && running) {
      running = false;
      showOverlay('Your partner disconnected.\nThe session has ended.', false);
    } else if (view === 'lobby') {
      hostLobby.guestIn = false; hostLobby.guestReady = false;
      recomputeAssignments(); refreshLobby();
      setStatus('lobby-status', 'Partner left the room.', true);
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
    net.send({ t: 'start', hostPick: myPick, guestAssigned: hostLobby.guestAssigned });
  });

  /* ---------------- online: guest ---------------- */
  function joinRoom(code) {
    code = (code || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{5}$/.test(code)) { setStatus('menu-status', 'Enter the 5-character room code.', true); return; }
    if (!Net.libReady()) { setStatus('menu-status', 'Netplay library failed to load — check your connection and refresh.', true); return; }
    role = 'guest';
    roomCode = code;
    guestLobby.assigned = otherColor(myPick); // provisional until host assigns
    setStatus('menu-status', 'Joining room ' + code + '…');
    var opened = false;
    net = Net.join(code, {
      onOpen: function () {
        opened = true;
        net.send({ t: 'hello', pick: myPick });
        show('lobby'); refreshLobby();
      },
      onData: function (d) { guestOnData(d); },
      onClose: function () {
        if (role !== 'guest') return;
        if (view === 'game' && (running || guestLobby.started)) {
          running = false;
          showOverlay('Connection to the host was lost.\nThe session has ended.', false);
        } else if (view === 'lobby') {
          setStatus('menu-status', 'The host left the room.', true);
          stopGameToMenu();
        }
      },
      onError: function (msg) {
        if (!opened) { setStatus('menu-status', msg, true); role = null; net = null; show('menu'); }
        else setStatus('game-status', msg, true);
      }
    });
    if (!net) { role = null; }
  }
  $('btn-join').addEventListener('click', function () { joinRoom($('join-code').value); });
  function guestOnData(d) {
    if (!d || !d.t) return;
    if (d.t === 'lobby') {
      guestLobby.hostPick = d.hostPick;
      if (d.guestAssigned) guestLobby.assigned = d.guestAssigned;
      guestLobby.hostReady = !!d.hostReady;
      if (view === 'lobby') refreshLobby();
    } else if (d.t === 'start') {
      guestLobby.started = true;
      finishShown = false;
      if (d.guestAssigned) { guestLobby.assigned = d.guestAssigned; myPick = d.guestAssigned; paintPicks(); }
      mirror = E.createGame({ mode: 'guest', twoPlayer: true });
      prevSnap = curSnap = null; snapCount = 0;
      running = true;
      hideOverlay();
      show('game'); paintHudMode();
      Sfx.startMusic();
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
      setStatus('menu-status', 'You were invited to room ' + room.toUpperCase() + ' — pick your character, then Join Room.');
      if (q.get('autojoin') === '1') joinRoom(room);
    }
  })();

  /* ---------------- fixed-timestep loop ---------------- */
  var last = 0, acc = 0, STEP = 1000 / 60;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = ts - last; last = ts;
    if (dt > 250) dt = 250;
    if (view !== 'game') return;

    if (role === 'guest') {
      // send my inputs at ~30Hz or on change
      var inp = myLocalInput();
      var key = [inp.l, inp.r, inp.u, inp.d, inp.run].map(Number).join('');
      if (net && (key !== lastSentInput || ts - lastInputSentAt > 120)) {
        net.send({ t: 'input', i: inp });
        lastSentInput = key; lastInputSentAt = ts;
      }
      if (running && mirror && curSnap) {
        renderGuest(ts);
        updateHud(mirror);
        if (mirror.finished) onFinished(mirror);
        if (Date.now() - lastSnapAt > 4000 && running) {
          running = false;
          showOverlay('Connection to the host was lost.\nThe session has ended.', false);
        }
      }
      return;
    }
    if (!running || !state) return;
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
    }
    render(state);
    updateHud(state);
  }
  requestAnimationFrame(frame);

  var finishShown = false;
  function onFinished(st) {
    if (finishShown) return;
    finishShown = true;
    Sfx.play('goal');
    var mins = Math.max(0, Math.ceil(st.timeLeft / 60));
    showOverlay('LEVEL CLEAR!\nCoins: ' + st.coinCount + '   Score: ' + st.score + '\nTime left: ' + mins + 's', role !== 'guest');
    if (role === 'guest') setStatus('game-status', 'Waiting for the host to restart or end the session.');
  }
  // reset the flag whenever a new game starts
  var _startGame = startGame;
  startGame = function () { finishShown = false; _startGame(); };

  function drainEvents(st) {
    for (var i = 0; i < st.events.length; i++) {
      var e = st.events[i];
      if (e === 'break') Sfx.play('brk');
      else if (e === 'goal') { /* handled by onFinished */ }
      else Sfx.play(e);
    }
    st.events.length = 0;
  }

  function updateHud(st) {
    $('hud-coins').textContent = st.coinCount;
    $('hud-score').textContent = st.score;
    $('hud-time').textContent = Math.max(0, Math.ceil(st.timeLeft / 60));
  }

  /* ---------------- rendering ---------------- */
  function render(st) { drawWorld(st, null); }

  function renderGuest(ts) {
    // interpolate player/enemy positions between the last two snapshots
    var alpha = 1;
    if (prevSnap && curSnap && curSnapAt > prevSnapAt) {
      alpha = Math.min(1, (ts - curSnapAt) / Math.max(1, curSnapAt - prevSnapAt) + 0.5);
    }
    drawWorld(mirror, { prev: prevSnap, alpha: alpha });
  }

  function lerpPos(snapArr, i, cur) {
    if (!snapArr || !snapArr[i]) return cur;
    return snapArr[i];
  }

  function drawWorld(st, interp) {
    var camX = Math.round(st.camX);
    S.drawBackground(ctx, camX, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(-camX, 0);

    // midpoint + goal poles (behind tiles)
    drawFlag(st.midpointTx * TILE + 6, 15 * TILE, st.midReached, '#39d353');
    drawFlag(st.goalTx * TILE + 6, st.goalTopTy * TILE, st.finished, '#f7c948');

    // tiles in view
    var tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    var tx1 = Math.min(st.levelW - 1, tx0 + VIEW_W / TILE + 2);
    for (var ty = 0; ty < st.levelH; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        var v = st.tiles[ty * st.levelW + tx];
        if (v !== E.T.EMPTY) S.drawTile(ctx, v, tx * TILE, ty * TILE, st.tick, st.gateOpen);
      }
    }
    // switches
    st.switches.forEach(function (sw) {
      var x = sw.tx * TILE, y = sw.ty * TILE;
      ctx.fillStyle = '#444c5c'; ctx.fillRect(x + 1, y + 12, 14, 4);
      ctx.fillStyle = sw.pressed ? '#39d353' : '#e23b2e';
      ctx.fillRect(x + 2, y + (sw.pressed ? 11 : 9), 12, 3);
    });
    // platforms
    st.platforms.forEach(function (pl) {
      ctx.fillStyle = '#6e4520'; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.fillStyle = '#a5713a'; ctx.fillRect(pl.x, pl.y, pl.w, 3);
      ctx.fillStyle = '#ffd94a';
      ctx.fillRect(pl.x + 3, pl.y + 3, 3, 3); ctx.fillRect(pl.x + pl.w - 6, pl.y + 3, 3, 3);
    });
    // coins
    st.coinsArr.forEach(function (c, i) {
      if (c.taken) return;
      var cx = c.x + 5, cy = c.y + 5 + Math.sin(st.tick * 0.1 + i) * 1.2;
      var wob = Math.abs(Math.sin(st.tick * 0.08 + i * 0.7));
      ctx.fillStyle = '#f7c948';
      ctx.beginPath(); ctx.ellipse(cx, cy, 2 + 3 * wob, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.ellipse(cx, cy, 1 + 1.4 * wob, 3, 0, 0, Math.PI * 2); ctx.fill();
    });
    // berries
    st.berries.forEach(function (b) {
      ctx.fillStyle = '#e2492f';
      ctx.beginPath(); ctx.arc(b.x + 7, b.y + 7, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#39d353'; ctx.fillRect(b.x + 6, b.y - 1, 2, 4);
    });
    // enemies
    st.enemies.forEach(function (e, i) {
      if (e.dead) return;
      var pos = interpPos(interp, 'enemies', i, e);
      var copy = Object.create(e); copy.x = pos[0]; copy.y = pos[1];
      S.drawEnemy(ctx, copy);
    });
    // players
    st.players.forEach(function (p, i) {
      if (p.absent) return;
      var pos = interpPos(interp, 'players', i, p);
      var copy = Object.create(p); copy.x = pos[0]; copy.y = pos[1];
      S.drawPlayer(ctx, copy, st.tick);
      // "you" marker over my own character in online/local-primary
      var mine = (role === 'solo' && p.slot === mySlot()) ||
                 (role === 'local' && p.slot === mySlot()) ||
                 (role === 'host' && p.slot === mySlot()) ||
                 (role === 'guest' && p.color === guestLobby.assigned);
      if (mine && p.state === 'play') {
        var mx = pos[0] + p.w / 2, my = pos[1] - 8 + Math.sin(st.tick * 0.15) * 1.5;
        ctx.fillStyle = '#ffd94a';
        ctx.beginPath(); ctx.moveTo(mx - 4, my - 5); ctx.lineTo(mx + 4, my - 5); ctx.lineTo(mx, my); ctx.closePath(); ctx.fill();
      }
    });
    ctx.restore();
  }

  function interpPos(interp, kind, i, cur) {
    if (!interp || !interp.prev) return [cur.x, cur.y];
    var prevArr = interp.prev[kind];
    if (!prevArr || !prevArr[i]) return [cur.x, cur.y];
    var a = interp.alpha;
    return [
      prevArr[i][0] + (cur.x - prevArr[i][0]) * a,
      prevArr[i][1] + (cur.y - prevArr[i][1]) * a
    ];
  }

  function drawFlag(x, baseY, active, color) {
    ctx.fillStyle = '#d8dde6'; ctx.fillRect(x, baseY - 80, 3, 80);
    ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(x + 1.5, baseY - 82, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = active ? color : '#8b93a1';
    ctx.beginPath();
    ctx.moveTo(x + 3, baseY - 78); ctx.lineTo(x + 19, baseY - 71); ctx.lineTo(x + 3, baseY - 64);
    ctx.closePath(); ctx.fill();
  }

  /* ---------------- test hooks (used by automated checks) ---------------- */
  window.__game = {
    get state() { return state; },
    get mirror() { return mirror; },
    get role() { return role; },
    get running() { return running; },
    get roomCode() { return roomCode; },
    get snapCount() { return snapCount; },
    get errors() { return errors; },
    get lobby() { return role === 'host' ? hostLobby : guestLobby; },
    setPick: setPick,
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

  show('menu');
  paintPicks();
})();
