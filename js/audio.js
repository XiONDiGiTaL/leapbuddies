/* audio.js — tiny WebAudio synth. All sounds are generated in code.
 * No audio files, nothing sampled. M toggles mute (handled by caller
 * via Sfx.setMuted). A simple original bass/melody loop is optional. */
(function (global) {
  'use strict';
  var ctx = null, muted = false, musicOn = false, musicTimer = null, step = 0;

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
    if (muted) return;
    var a = ac(); if (!a) return;
    var t = a.currentTime + (when || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freqA, t);
    if (freqB && freqB !== freqA) o.frequency.exponentialRampToValueAtTime(Math.max(freqB, 1), t + dur);
    g.gain.setValueAtTime(vol || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
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
    timeout:function () { [440, 440, 440].forEach(function (f, i) { tone(f, f, 0.14, 'square', 0.07, i * 0.16); }); }
  };

  // very small original loop: a bouncy I–V–vi–IV in C, square lead + triangle bass
  var LEAD = [523, 0, 659, 0, 784, 0, 659, 0, 587, 0, 698, 0, 880, 0, 698, 0,
              440, 0, 523, 0, 659, 0, 523, 0, 494, 0, 587, 0, 659, 0, 0, 0];
  var BASS = [131, 0, 0, 0, 196, 0, 0, 0, 110, 0, 0, 0, 175, 0, 0, 0,
              98, 0, 0, 0, 147, 0, 0, 0, 131, 0, 0, 0, 196, 0, 0, 0];
  function musicTick() {
    if (!musicOn) return;
    var i = step % 32;
    if (LEAD[i]) tone(LEAD[i], LEAD[i], 0.13, 'square', 0.028);
    if (BASS[i]) tone(BASS[i], BASS[i], 0.16, 'triangle', 0.05);
    step++;
  }
  global.Sfx = {
    play: function (name) { if (S[name]) S[name](); },
    unlock: function () { ac(); },
    setMuted: function (m) { muted = m; },
    isMuted: function () { return muted; },
    startMusic: function () {
      if (musicOn) return; musicOn = true;
      musicTimer = setInterval(musicTick, 150);
    },
    stopMusic: function () { musicOn = false; if (musicTimer) clearInterval(musicTimer); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
