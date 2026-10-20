/* audio.js — tiny WebAudio synth. Every sound is generated in code; there
 * are no audio files and nothing is sampled. M toggles mute (the caller
 * uses Sfx.setMuted). Each stage has its own 32-step loop: same simple
 * construction as the original, different scale, tempo and percussion. */
(function (global) {
  'use strict';
  var ctx = null, muted = false, musicOn = false, musicTimer = null, step = 0;
  var current = 'izmir', noiseBuf = null;
  /* master level, 0..1. Every voice is scaled through level() so one slider
   * moves effects and music together; muting stays a separate switch. */
  var volume = 0.8;
  function level() { return muted ? 0 : volume; }

  function ac() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freqA, freqB, dur, type, vol, when) {
    var lv = level();
    if (lv <= 0) return;
    var a = ac(); if (!a) return;
    var t = a.currentTime + (when || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freqA, t);
    if (freqB && freqB !== freqA) o.frequency.exponentialRampToValueAtTime(Math.max(freqB, 1), t + dur);
    g.gain.setValueAtTime((vol || 0.08) * lv, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  /* one shared white-noise buffer, filtered per hit — that's the whole drum kit */
  function noise(dur, vol, freq, type, when) {
    var lv = level();
    if (lv <= 0) return;
    var a = ac(); if (!a) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, Math.ceil(a.sampleRate * 0.3), a.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = a.currentTime + (when || 0);
    var src = a.createBufferSource(); src.buffer = noiseBuf;
    var f = a.createBiquadFilter();
    f.type = type || 'highpass';
    f.frequency.value = freq || 4000;
    f.Q.value = 0.9;
    var g = a.createGain();
    g.gain.setValueAtTime(vol * lv, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(t); src.stop(t + dur + 0.03);
  }
  function drum(kind) {
    if (kind === 'kick') tone(150, 46, 0.15, 'sine', 0.075);
    else if (kind === 'snare') { noise(0.09, 0.05, 1900); tone(200, 150, 0.06, 'triangle', 0.03); }
    else if (kind === 'tek') noise(0.045, 0.035, 5200);
    else noise(0.03, 0.02, 7000);
  }

  var S = {
    jump:   function () { tone(280, 640, 0.16, 'square', 0.06); },
    coin:   function () { tone(990, 990, 0.07, 'square', 0.07); tone(1320, 1320, 0.22, 'square', 0.07, 0.07); },
    stomp:  function () { tone(420, 60, 0.14, 'triangle', 0.12); },
    boing:  function () { tone(200, 520, 0.14, 'sine', 0.1); },
    bump:   function () { tone(140, 90, 0.08, 'square', 0.07); },
    brk:    function () { tone(220, 40, 0.2, 'sawtooth', 0.08); },
    kick:   function () { tone(300, 120, 0.1, 'square', 0.08); },
    sprout: function () { tone(520, 880, 0.18, 'sine', 0.07); },
    power:  function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, f, 0.1, 'square', 0.07, i * 0.06); }); },
    shrink: function () { [784, 659, 523, 392].forEach(function (f, i) { tone(f, f, 0.1, 'square', 0.07, i * 0.06); }); },
    out:    function () { tone(600, 110, 0.35, 'triangle', 0.1); },
    pop:    function () { tone(500, 900, 0.1, 'sine', 0.1); },
    gate:   function () { tone(180, 360, 0.4, 'sawtooth', 0.05); },
    mid:    function () { [659, 784].forEach(function (f, i) { tone(f, f, 0.12, 'square', 0.07, i * 0.09); }); },
    goal:   function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, f, 0.16, 'square', 0.08, i * 0.11); }); },
    land:   function () { tone(120, 80, 0.05, 'triangle', 0.04); },
    lifeloss: function () { [392, 330, 262].forEach(function (f, i) { tone(f, f, 0.16, 'square', 0.07, i * 0.12); }); },
    gameover: function () { [392, 311, 262, 196].forEach(function (f, i) { tone(f, f * 0.98, 0.3, 'triangle', 0.09, i * 0.2); }); },
    timeout:function () { [440, 440, 440].forEach(function (f, i) { tone(f, f, 0.14, 'square', 0.07, i * 0.16); }); }
  };

  /* ---------------- stage loops (32 steps each) ----------------
   * 0 marks a rest. Notes are plain frequencies so a loop stays readable.
   * Lead + bass + a three-piece drum grid is all the arrangement there is. */
  var PATTERNS = {
    /* İzmir — the original bright bouncy loop, I–V–vi–IV in C */
    izmir: {
      ms: 150, leadType: 'square', bassType: 'triangle',
      lead: [523, 0, 659, 0, 784, 0, 659, 0, 587, 0, 698, 0, 880, 0, 698, 0,
             440, 0, 523, 0, 659, 0, 523, 0, 494, 0, 587, 0, 659, 0, 0, 0],
      bass: [131, 0, 0, 0, 196, 0, 0, 0, 110, 0, 0, 0, 175, 0, 0, 0,
             98, 0, 0, 0, 147, 0, 0, 0, 131, 0, 0, 0, 196, 0, 0, 0],
      drums: { k: [0, 16], h: [4, 12, 20, 28] }
    },
    /* New York — midnight: walking bass, swaggering off-beat lead, kick + snare */
    nyc: {
      ms: 165, leadType: 'triangle', bassType: 'triangle',
      lead: [349, 0, 0, 415, 0, 0, 523, 0, 466, 0, 0, 415, 0, 0, 349, 0,
             622, 0, 0, 523, 0, 0, 415, 0, 466, 0, 523, 0, 415, 0, 0, 0],
      bass: [175, 0, 0, 0, 208, 0, 0, 0, 262, 0, 0, 0, 156, 0, 0, 0,
             175, 0, 0, 0, 208, 0, 0, 0, 139, 0, 0, 0, 131, 0, 0, 0],
      drums: { k: [0, 10, 16, 26], s: [4, 12, 20, 28], h: [2, 6, 14, 18, 22, 30] }
    },
    /* İstanbul — dusk over the strait: harmonic-minor melody, darbuka dum/tek */
    istanbul: {
      ms: 145, leadType: 'sawtooth', bassType: 'triangle',
      lead: [440, 0, 523, 0, 494, 0, 659, 0, 587, 0, 523, 494, 0, 415, 0, 0,
             440, 0, 523, 0, 659, 0, 698, 0, 659, 0, 587, 0, 523, 0, 0, 0],
      bass: [110, 0, 0, 0, 165, 0, 0, 0, 175, 0, 0, 0, 208, 0, 0, 0,
             110, 0, 0, 0, 165, 0, 0, 0, 131, 0, 0, 0, 165, 0, 0, 0],
      drums: { k: [0, 6, 16, 22], tek: [2, 4, 8, 12, 14, 18, 20, 24, 28, 30] }
    },
    /* Tampa — sunny afternoon: 80s pop lift, gated stabs and a straight beat */
    tampa: {
      ms: 155, leadType: 'square', bassType: 'triangle',
      lead: [523, 0, 659, 0, 784, 0, 880, 0, 784, 0, 659, 0, 587, 0, 659, 0,
             523, 0, 659, 0, 784, 0, 1047, 0, 880, 0, 784, 0, 659, 0, 0, 0],
      bass: [131, 0, 0, 0, 196, 0, 0, 0, 220, 0, 0, 0, 175, 0, 0, 0,
             131, 0, 0, 0, 196, 0, 0, 0, 220, 0, 0, 0, 175, 0, 0, 0],
      drums: { k: [0, 8, 16, 24], s: [4, 12, 20, 28], h: [2, 6, 10, 14, 18, 22, 26, 30] }
    }
  };

  function musicTick() {
    if (!musicOn) return;
    var p = PATTERNS[current] || PATTERNS.izmir;
    var i = step % 32;
    if (p.lead[i]) tone(p.lead[i], p.lead[i], 0.13, p.leadType, 0.026);
    if (p.bass[i]) tone(p.bass[i], p.bass[i], 0.16, p.bassType, 0.05);
    var d = p.drums || {};
    if (d.k && d.k.indexOf(i) >= 0) drum('kick');
    if (d.s && d.s.indexOf(i) >= 0) drum('snare');
    if (d.h && d.h.indexOf(i) >= 0) drum('hat');
    if (d.tek && d.tek.indexOf(i) >= 0) drum('tek');
    step++;
  }

  global.Sfx = {
    play: function (name) { if (S[name]) S[name](); },
    unlock: function () { ac(); },
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
    /* 0 = silent, 1 = full. Values outside the range are clamped. */
    setVolume: function (v) {
      var n = Number(v);
      if (!isFinite(n)) return volume;
      volume = Math.max(0, Math.min(1, n));
      return volume;
    },
    getVolume: function () { return volume; },
    /* start (or switch) the loop for a stage: izmir | nyc | istanbul | tampa */
    startMusic: function (stageId) {
      var want = PATTERNS[stageId] ? stageId : 'izmir';
      if (musicOn) {
        if (want !== current) { current = want; step = 0; }
        return;
      }
      current = want;
      step = 0;
      musicOn = true;
      musicTimer = setInterval(musicTick, PATTERNS[current].ms);
    },
    stopMusic: function () { musicOn = false; if (musicTimer) clearInterval(musicTimer); musicTimer = null; },
    stage: function () { return current; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
