/* sprites.js — all art is original and drawn in code.
 * Character/enemy bodies are tiny pixel maps defined here; tiles and
 * scenery are drawn procedurally. No external image assets anywhere.
 */
(function (global) {
  'use strict';

  /* Pixel maps: 14 wide. Head+torso is 13 rows, legs are 7 rows and
   * swapped per animation frame. Palette keys are remapped per character
   * so the red lead and green lead share one design with swapped colors. */
  var BODY = [
    '..............',
    '....CCCCCC....',
    '...CCCCCCCC...',
    '..CCDDDDDDCC..',
    '..SSSSSSSSSS..',
    '..SEKSSSSEKS..',
    '..SSSSSSSSSS..',
    '...SSSSSSSS...',
    '..BBBBBBBBBB..',
    '.SBBBBBBBBBBS.',
    '.SSBBBBBBBBSS.',
    '..BBBWWBBB....',
    '..BBBBBBBB....'
  ];
  var LEGS = {
    stand: [
      '...BB...BB....',
      '...BB...BB....',
      '...BB...BB....',
      '..DDD...DDD...',
      '..DDD...DDD...',
      '..............',
      '..............'
    ],
    run1: [
      '..BB.....BB...',
      '..BB......BB..',
      '.BB........BB.',
      '.DDD.......DDD',
      'DDD.........DD',
      '..............',
      '..............'
    ],
    run2: [
      '....BB.BB.....',
      '....BBBBB.....',
      '.....BBB......',
      '....DD.DD.....',
      '...DD...DD....',
      '..............',
      '..............'
    ],
    jump: [
      '..BB.....BB...',
      '..BBB...BBB...',
      '..DDD...DDD...',
      '..............',
      '..............',
      '..............',
      '..............'
    ]
  };
  var WALKER = [
    '..............',
    '.....OOOO.....',
    '...OOOOOOOO...',
    '..OOOWOOOWOO..',
    '..OOOOOOOOOO..',
    '.OOOOOOOOOOOO.',
    '.OOOOKOOOKOOO.',
    '..OOOOOOOOOO..',
    '...FFFFFFFF...',
    '...FF....FF...',
    '..FFF....FFF..',
    '..............'
  ];
  var SHELLER_BODY = [
    '..............',
    '.....TTTT.....',
    '....TTTTTT....',
    '...TTETETT....',
    '...TTTTTT.....',
    '..GGGGGGGGGG..',
    '.GGGGGGGGGGGG.',
    '.GWGGGGGGGGWG.',
    '.GGGGGGGGGGGG.',
    '..GGGGGGGGGG..',
    '...FF....FF...',
    '..FFF....FFF..',
    '..............',
    '..............'
  ];
  var SHELL_ONLY = [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..GGGGGGGGGG..',
    '.GGGGGGGGGGGG.',
    '.GWGGGGGGGGWG.',
    '.GGGGGGGGGGGG.',
    '..GGGGGGGGGG..'
  ];

  var PALETTES = {
    red:   { C: '#e23b2e', D: '#8f1d14', S: '#f2b98a', E: '#20202a', B: '#274690', W: '#f4f4f4' },
    green: { C: '#2fae4e', D: '#17632c', S: '#f2b98a', E: '#20202a', B: '#274690', W: '#f4f4f4' },
    walker:  { O: '#b0722f', W: '#ffffff', K: '#20202a', F: '#6e4416' },
    sheller: { T: '#f2b98a', E: '#20202a', G: '#2e8f86', W: '#dff7f2', F: '#20504c' }
  };

  function renderMap(rows, palette, w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    for (var y = 0; y < rows.length; y++) {
      var row = rows[y];
      for (var x = 0; x < row.length; x++) {
        var ch = row.charAt(x);
        if (ch === '.' || ch === ' ') continue;
        ctx.fillStyle = palette[ch] || '#f0f';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }
  function flip(img) {
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var ctx = c.getContext('2d');
    ctx.translate(img.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    return c;
  }

  var cache = {};
  function build() {
    if (cache.done) return cache;
    ['red', 'green'].forEach(function (color) {
      var pal = PALETTES[color];
      var body = renderMap(BODY, pal, 14, 13);
      cache[color] = {};
      ['stand', 'run1', 'run2', 'jump'].forEach(function (f) {
        var full = document.createElement('canvas');
        full.width = 14; full.height = 20;
        var ctx = full.getContext('2d');
        ctx.drawImage(body, 0, 0);
        ctx.drawImage(renderMap(LEGS[f], pal, 14, 7), 0, 13);
        cache[color][f] = { n: full, f: flip(full) };
      });
    });
    var wk = renderMap(WALKER, PALETTES.walker, 14, 12);
    cache.walker = { n: wk, f: flip(wk) };
    var sh = renderMap(SHELLER_BODY, PALETTES.sheller, 14, 14);
    cache.sheller = { n: sh, f: flip(sh) };
    cache.shell = renderMap(SHELL_ONLY, PALETTES.sheller, 14, 10);
    cache.done = true;
    return cache;
  }

  function drawPlayer(ctx, p, tick) {
    var sprs = build();
    var frame = 'stand';
    if (p.state === 'bubble') frame = 'jump';
    else if (!p.onGround && !p.onPartner) frame = 'jump';
    else if (Math.abs(p.vx) > 0.25) frame = (Math.floor(tick / 7) % 2 === 0) ? 'run1' : 'run2';
    var img = sprs[p.color][frame][p.face < 0 ? 'f' : 'n'];
    var dx = Math.round(p.x + p.w / 2 - 7), dy = Math.round(p.y + p.h - 20);
    if (p.big) { dx -= 1; dy -= 3; }
    if (p.invuln > 0 && Math.floor(tick / 3) % 2 === 0 && p.state === 'play') return; // blink
    ctx.save();
    if (p.big) { ctx.translate(dx + 7, dy + 20); ctx.scale(1.12, 1.12); ctx.translate(-7, -20); ctx.translate(-dx, -dy); ctx.translate(dx, dy); }
    if (p.squash > 0) { ctx.translate(dx + 7, dy + 20); ctx.scale(1.15, 0.78); ctx.translate(-(dx + 7), -(dy + 20)); }
    if (p.state === 'bubble') {
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(170,220,255,0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,250,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.drawImage(img, dx, dy);
    ctx.restore();
  }

  function drawEnemy(ctx, e) {
    var sprs = build();
    if (e.state === 'shell' || e.state === 'slide') {
      var bob = e.state === 'shell' && e.timer > 420 ? (Math.floor(e.timer / 4) % 2) : 0;
      ctx.drawImage(sprs.shell, Math.round(e.x), Math.round(e.y + e.h - 10) + bob);
      return;
    }
    var img = e.type === 'walker'
      ? sprs.walker[e.dir < 0 ? 'n' : 'f']
      : sprs.sheller[e.dir < 0 ? 'n' : 'f'];
    ctx.drawImage(img, Math.round(e.x), Math.round(e.y + e.h - img.height));
  }

  /* ---------------- procedural tiles & scenery ---------------- */
  function drawTile(ctx, type, x, y, tick, gateOpen) {
    var T = global.Engine.T;
    if (type === T.EMPTY) return;
    if (type === T.SOLID) {
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#a5713a'; ctx.fillRect(x, y, 16, 5);
      ctx.fillStyle = '#57a639'; ctx.fillRect(x, y, 16, 4);
      ctx.fillStyle = '#478c2e'; ctx.fillRect(x + 3, y + 1, 2, 2); ctx.fillRect(x + 11, y + 2, 2, 2);
      ctx.fillStyle = '#6e4520'; ctx.fillRect(x + 5, y + 9, 3, 2); ctx.fillRect(x + 11, y + 12, 2, 2);
    } else if (type === T.BRICK) {
      ctx.fillStyle = '#b5563c'; ctx.fillRect(x, y, 16, 16);
      ctx.strokeStyle = '#7c3524'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0.5 + x, y + 5.5); ctx.lineTo(x + 16, y + 5.5);
      ctx.moveTo(0.5 + x, y + 10.5); ctx.lineTo(x + 16, y + 10.5);
      ctx.moveTo(x + 8.5, y); ctx.lineTo(x + 8.5, y + 5);
      ctx.moveTo(x + 4.5, y + 5); ctx.lineTo(x + 4.5, y + 10);
      ctx.moveTo(x + 12.5, y + 5); ctx.lineTo(x + 12.5, y + 10);
      ctx.moveTo(x + 8.5, y + 10); ctx.lineTo(x + 8.5, y + 16);
      ctx.stroke();
    } else if (type === T.QBLOCK || type === T.PBLOCK) {
      ctx.fillStyle = '#e8a91c'; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#f7c948'; ctx.fillRect(x + 1, y + 1, 14, 14);
      ctx.fillStyle = '#b97e10';
      ctx.fillRect(x + 1, y + 1, 2, 2); ctx.fillRect(x + 13, y + 1, 2, 2);
      ctx.fillRect(x + 1, y + 13, 2, 2); ctx.fillRect(x + 13, y + 13, 2, 2);
      ctx.fillStyle = '#fff3c4';
      if (type === T.QBLOCK) { // star glyph
        ctx.fillRect(x + 7, y + 4, 2, 8); ctx.fillRect(x + 4, y + 7, 8, 2);
        ctx.fillRect(x + 5, y + 5, 2, 2); ctx.fillRect(x + 9, y + 5, 2, 2);
        ctx.fillRect(x + 5, y + 9, 2, 2); ctx.fillRect(x + 9, y + 9, 2, 2);
      } else { // berry glyph
        ctx.beginPath(); ctx.arc(x + 8, y + 9, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x + 8, y + 3, 1, 3);
      }
    } else if (type === T.USED) {
      ctx.fillStyle = '#9c6b30'; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#7d5525'; ctx.fillRect(x + 1, y + 1, 14, 2);
      ctx.fillStyle = '#b98a44';
      ctx.fillRect(x + 1, y + 1, 2, 2); ctx.fillRect(x + 13, y + 1, 2, 2);
      ctx.fillRect(x + 1, y + 13, 2, 2); ctx.fillRect(x + 13, y + 13, 2, 2);
    } else if (type === T.GATE) {
      var slide = Math.floor((gateOpen || 0) * 16);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, 16, 16); ctx.clip();
      ctx.translate(0, -slide);
      ctx.fillStyle = '#5b6470'; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#78828f'; ctx.fillRect(x + 2, y + 2, 12, 2); ctx.fillRect(x + 2, y + 7, 12, 2); ctx.fillRect(x + 2, y + 12, 12, 2);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(x + 6, y + 5, 4, 4);
      ctx.restore();
    }
  }

  function drawBackground(ctx, camX, w, h) {
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5db9f5'); grad.addColorStop(0.7, '#a5dcf9'); grad.addColorStop(1, '#d8f3ff');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    // sun
    ctx.fillStyle = '#fff6b7'; ctx.beginPath(); ctx.arc(w - 70, 42, 20, 0, Math.PI * 2); ctx.fill();
    // clouds (parallax 0.3)
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (var i = 0; i < 14; i++) {
      var cx = ((i * 197 + 40 - camX * 0.3) % (w + 160) + (w + 160)) % (w + 160) - 80;
      var cy = 26 + (i * 37) % 70;
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.arc(cx + 14, cy + 3, 10, 0, Math.PI * 2); ctx.arc(cx - 14, cy + 3, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // hills (parallax 0.55)
    for (var j = 0; j < 10; j++) {
      var hx = ((j * 260 - camX * 0.55) % (w + 300) + (w + 300)) % (w + 300) - 150;
      ctx.fillStyle = j % 2 ? '#69bb4a' : '#7cc958';
      ctx.beginPath();
      ctx.moveTo(hx - 90, h); ctx.quadraticCurveTo(hx, h - 120 - (j % 3) * 22, hx + 90, h); ctx.closePath(); ctx.fill();
    }
  }

  global.Sprites = {
    drawPlayer: drawPlayer, drawEnemy: drawEnemy,
    drawTile: drawTile, drawBackground: drawBackground
  };
})(typeof window !== 'undefined' ? window : globalThis);
