/* render3d.js — the 3D voxel layer.
 *
 * Everything the player sees is generated here from boxes: tiles, both
 * characters, enemies, pickups, switches, the gate, flags and four stage
 * skylines. The simulation in engine.js is untouched — this file only
 * reads game state and draws it through Three.js.
 *
 * Coordinate mapping: engine pixels are 1:1 with world units. Engine X
 * maps to +X, engine Y (down) maps to -Y, and Z pushes toward the camera
 * so the side view gains real depth.
 */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  if (!THREE) return;

  var TILE = 16;
  var VIEW_W = 512, VIEW_H = 288;
  var CAM_Z = 620;

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */
  var _tmpColor = new THREE.Color();
  function C(hex) {
    _tmpColor.setHex(hex);
    if (_tmpColor.convertSRGBToLinear) _tmpColor.convertSRGBToLinear();
    return _tmpColor.clone();
  }

  /* A single non-indexed box whose vertices are rewritten per part, so a
   * whole character/limb is one draw call with flat vertex colours. */
  var UNIT = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  var UNIT_POS = UNIT.attributes.position.array;
  var UNIT_NRM = UNIT.attributes.normal.array;

  function mergeParts(parts) {
    var per = UNIT_POS.length / 3;
    var n = parts.length * per;
    var pos = new Float32Array(n * 3);
    var nrm = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    var o = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var c = C(p[6]);
      for (var k = 0; k < per; k++) {
        pos[o] = UNIT_POS[k * 3] * p[3] + p[0];
        pos[o + 1] = UNIT_POS[k * 3 + 1] * p[4] + p[1];
        pos[o + 2] = UNIT_POS[k * 3 + 2] * p[5] + p[2];
        nrm[o] = UNIT_NRM[k * 3];
        nrm[o + 1] = UNIT_NRM[k * 3 + 1];
        nrm[o + 2] = UNIT_NRM[k * 3 + 2];
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        o += 3;
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }

  /* characters get a touch of self-illumination so they stay readable
   * against the city behind them */
  var VOXEL_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x161210 });
  var BG_MAT_COLOR = 0.9;
  var Y_AXIS = new THREE.Vector3(0, 1, 0);

  function meshOf(parts, mat) {
    return new THREE.Mesh(mergeParts(parts), mat || VOXEL_MAT);
  }

  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ */
  /* Stages: palette + skyline flavour                                   */
  /* ------------------------------------------------------------------ */
  var STAGES = [
    {
      id: 'izmir', name: 'İzmir', tag: 'sunset coast', seed: 9211,
      sky: ['#ffd9a0', '#f08e62', '#6d4b7a'],
      sun: 0xffd08a,
      far: 0xbb8680, mid: 0x8e5a6a, near: 0x5f4356,
      window: 0xffd9a0,
      tile: { solid: 0xb57a55, cap: 0x8fb35c, brick: 0xc0714a, q: 0xefa82e, p: 0xf0a45f, used: 0x8d7a63, gate: 0x6b5f6a }
    },
    {
      id: 'nyc', name: 'New York', tag: 'midnight avenue', seed: 4477,
      sky: ['#101c38', '#2b3f6b', '#7e8fb0'],
      sun: 0xd9e4ff,
      far: 0x46557a, mid: 0x303d5e, near: 0x212a44,
      window: 0xffe6a8,
      tile: { solid: 0x6b6f7a, cap: 0x8c9199, brick: 0x8a4b48, q: 0xefa82e, p: 0xf0a45f, used: 0x767b86, gate: 0x4d5665 }
    },
    {
      id: 'istanbul', name: 'İstanbul', tag: 'dusk over the strait', seed: 7351,
      sky: ['#3a2a52', '#a05a72', '#f0aa78'],
      sun: 0xffc98a,
      far: 0x96748f, mid: 0x70507a, near: 0x4b3653,
      window: 0xffd9a0,
      tile: { solid: 0xa9765a, cap: 0x93a95a, brick: 0xc27f52, q: 0xefa82e, p: 0xf0a45f, used: 0x8a7767, gate: 0x5f5566 }
    },
    {
      id: 'tampa', name: 'Tampa', tag: 'sunny palms', seed: 1187,
      sky: ['#8fd3e8', '#bfeaf2', '#f6e2aa'],
      sun: 0xfff1b8,
      far: 0x6c9fae, mid: 0x3c7883, near: 0x245861,
      window: 0xfff0c0,
      tile: { solid: 0xb98a5e, cap: 0x5cb86b, brick: 0xbf7a50, q: 0xefa82e, p: 0xf0a45f, used: 0x8d7f6a, gate: 0x5c6a63 }
    }
  ];
  function stageById(id) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return STAGES[i];
    return STAGES[0];
  }

  function skyTexture(colors) {
    var cv = document.createElement('canvas');
    cv.width = 8; cv.height = 256;
    var g = cv.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.58, colors[1]);
    grad.addColorStop(1, colors[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 256);
    var tex = new THREE.CanvasTexture(cv);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  /* ------------------------------------------------------------------ */
  /* Skyline generator — boxes only, so it matches the voxel world       */
  /* ------------------------------------------------------------------ */
  function skyline(stage, layer, rnd) {
    var out = [];                       // [cx, cy, w, h, d, color]
    var col = layer === 0 ? stage.far : layer === 1 ? stage.mid : stage.near;
    var d = layer === 0 ? 40 : layer === 1 ? 52 : 64;
    var x = -320, end = 3160;
    var litChance = layer === 0 ? 0.12 : 0.3;

    function b(cx, cy, w, h, dd, c, zOff) {
      out.push([cx, cy, w, h, dd, c, zOff || 0]);
    }
    function windows(cx, baseY, w, h, front) {
      if (layer === 0) return;
      var stepX = 14, stepY = 17;
      for (var wy = baseY + 16; wy < h - 10; wy += stepY) {
        for (var wx = -w / 2 + 9; wx < w / 2 - 6; wx += stepX) {
          if (rnd() > litChance) continue;
          b(cx + wx, wy, 5, 7, 1.4, stage.window, front);
        }
      }
    }
    function minaret(cx, baseH) {
      b(cx, baseH / 2, 11, baseH, 11, col);
      b(cx, baseH + 5, 19, 8, 19, col);          // balcony
      b(cx, baseH + 14, 8, 12, 8, col);          // shaft
      b(cx, baseH + 24, 6, 10, 6, col);          // cone
      b(cx, baseH + 31, 3, 8, 3, col, 2);
    }
    function dome(cx, baseH) {
      b(cx, baseH / 2, 54, baseH, 54, col);
      b(cx, baseH + 9, 44, 18, 44, col);
      b(cx, baseH + 22, 32, 14, 32, col);
      b(cx, baseH + 32, 18, 10, 18, col);
      b(cx, baseH + 40, 5, 12, 5, col, 3);
    }
    function palm(cx, baseY) {
      var trunk = layer === 2 ? 0x6b4a2f : col;
      var leaf = layer === 2 ? 0x2f7a4a : col;
      var leaf2 = layer === 2 ? 0x3c8c57 : col;
      b(cx, baseY + 17, 5, 34, 5, trunk);
      b(cx - 9, baseY + 33, 19, 4, 6, leaf, 3);      // drooping fronds
      b(cx - 15, baseY + 30, 15, 4, 6, leaf2, 3);
      b(cx + 9, baseY + 34, 19, 4, 6, leaf, 3);
      b(cx + 15, baseY + 31, 15, 4, 6, leaf2, 3);
      b(cx, baseY + 39, 21, 4, 6, leaf2, 3);
      b(cx, baseY + 36, 7, 7, 7, leaf, 2);
    }
    function cypress(cx, baseY) {
      b(cx, baseY + 26, 11, 52, 11, layer === 2 ? 0x2f5c3e : col);
      b(cx, baseY + 46, 6, 22, 6, layer === 2 ? 0x356a46 : col);
    }

    while (x < end) {
      var roll = rnd();
      if (stage.id === 'nyc') {
        var w = 44 + rnd() * 74;
        var h = (layer === 0 ? 126 : layer === 1 ? 92 : 62) + rnd() * (layer === 0 ? 96 : 54);
        b(x + w / 2, h / 2, w, h, d, col);
        if (rnd() > 0.55) b(x + w / 2, h + 26, w * 0.7, 52, d * 0.8, col);        // setback
        if (rnd() > 0.8) { b(x + w / 2, h + 12, 10, 24, 10, col, 4); }               // spire
        windows(x + w / 2, 0, w, h, d / 2 + 0.4);
        x += w + 8 + rnd() * 26;
      } else if (stage.id === 'istanbul') {
        var w2 = 50 + rnd() * 70;
        var h2 = (layer === 0 ? 50 : 40) + rnd() * 40;
        if (roll > 0.74 && layer < 2) { dome(x + 34, 46); x += 92; }
        else if (roll > 0.6) { minaret(x + 10, 96); x += 46; }
        else {
          b(x + w2 / 2, h2 / 2, w2, h2, d, col);
          b(x + w2 / 2, h2 + 3, w2 + 6, 6, d + 6, col);                                // cornice
          windows(x + w2 / 2, 0, w2, h2, d / 2 + 0.4);
          x += w2 + 6 + rnd() * 22;
        }
      } else if (stage.id === 'tampa') {
        var w3 = 46 + rnd() * 76;
        var h3 = (layer === 0 ? 38 : 30) + rnd() * 32;
        if (roll > 0.82 && layer > 0) { palm(x, 0); x += 40 + rnd() * 30; }
        else if (roll > 0.72 && layer === 2) { cypress(x, 0); x += 34; }
        else {
          b(x + w3 / 2, h3 / 2, w3, h3, d, col);
          b(x + w3 / 2, h3 + 2, w3 + 8, 4, d + 8, col);
          windows(x + w3 / 2, 0, w3, h3, d / 2 + 0.4);
          x += w3 + 10 + rnd() * 26;
        }
      } else { // izmir
        var w4 = 52 + rnd() * 74;
        var h4 = (layer === 0 ? 44 : 34) + rnd() * 38;
        if (roll > 0.84) { minaret(x + 12, 86); x += 50; }
        else if (roll > 0.74 && layer > 0) { palm(x + 8, 0); x += 46; }
        else {
          b(x + w4 / 2, h4 / 2, w4, h4, d, col);
          b(x + w4 / 2, h4 + 2, w4 + 6, 4, d + 6, col);
          if (rnd() > 0.6) b(x + w4 / 2, h4 + 8, w4 * 0.5, 12, d * 0.6, col);        // rooftop room
          windows(x + w4 / 2, 0, w4, h4, d / 2 + 0.4);
          x += w4 + 8 + rnd() * 24;
        }
      }
    }
    return out;
  }

  /* One instanced mesh for a whole parallax layer (a single draw call). */
  function instancedBoxes(list) {
    var geo = new THREE.BoxGeometry(1, 1, 1);
    var mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.color.multiplyScalar(BG_MAT_COLOR);
    var mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    var m = new THREE.Matrix4(), q = new THREE.Quaternion();
    var pos = new THREE.Vector3(), scl = new THREE.Vector3();
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      pos.set(b[0], b[1], b[6] || 0);
      scl.set(b[2], b[3], b[4]);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
      var c = b[5];
      var cc = (c && c.isColor) ? c : C(c);
      mesh.setColorAt(i, cc);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* ------------------------------------------------------------------ */
  /* Characters — S.C. and B.T.                                          */
  /* ------------------------------------------------------------------ */
  var SC = {
    skin: 0xa9744f, shade: 0x8b5b3c, hair: 0x121012, hair2: 0x221d24,
    tee: 0x1b1d26, tee2: 0x121419, red: 0xd63a2f, red2: 0x8f231b,
    chain: 0xdfe3e8, jeans: 0x2f3a58, shoe: 0x1a1b20, shoeRed: 0xcc3b30, sole: 0xe6e6ea
  };
  var BT = {
    skin: 0xe8b994, shade: 0xd2a17c, hair: 0x241a17, hair2: 0x4a362b,
    blouse: 0xf7f4ec, blouse2: 0xdfd8cb, dot: 0xa9876a, mouth: 0xb0705e,
    jeans: 0x3d63a0, shoe: 0xf2ede2, sole: 0xd6cec0, stripe: 0x8fb6e0, trim: 0xd8d2c6
  };

  function buildSC() {
    var torso = [
      [0, 12.3, 0, 9.2, 7.0, 5.4, SC.tee],
      [0, 15.5, 0, 8.6, 1.0, 5.0, SC.tee2],
      [0, 9.2, 0, 8.4, 1.5, 5.0, 0x23252d],
      [0, 12.7, 2.85, 3.0, 3.0, 0.5, SC.red],
      [0.9, 12.0, 3.1, 1.4, 1.4, 0.5, SC.red2],
      [-0.8, 13.4, 3.1, 1.1, 1.1, 0.5, SC.red2],
      [0, 15.0, 2.75, 5.4, 0.8, 0.9, SC.chain],
      [-1.6, 14.7, 2.9, 0.8, 1.3, 0.8, SC.chain],
      [1.6, 14.7, 2.9, 0.8, 1.3, 0.8, SC.chain],
      [0, 14.0, 3.0, 1.2, 1.2, 0.8, SC.chain]
    ];
    var head = [
      [0, 3.5, 0, 7.8, 7.0, 7.4, SC.skin],
      [-4.1, 3.4, 0, 0.8, 1.6, 1.4, SC.shade],
      [4.1, 3.4, 0, 0.8, 1.6, 1.4, SC.shade],
      [-1.7, 4.3, 3.75, 1.1, 1.1, 0.3, 0x201812],
      [1.7, 4.3, 3.75, 1.1, 1.1, 0.3, 0x201812],
      [-1.75, 5.25, 3.8, 1.5, 0.5, 0.3, SC.hair],
      [1.75, 5.25, 3.8, 1.5, 0.5, 0.3, SC.hair],
      [0, 3.5, 4.0, 1.1, 1.3, 0.9, SC.shade],
      [0, 2.85, 3.95, 3.6, 0.7, 0.5, SC.hair],
      [0, 1.15, 3.2, 6.6, 1.9, 2.6, SC.hair],
      [-3.55, 2.4, 2.6, 1.3, 3.4, 4.2, SC.hair],
      [3.55, 2.4, 2.6, 1.3, 3.4, 4.2, SC.hair],
      [0, 1.5, 0.2, 6.8, 1.6, 5.6, SC.hair],
      [0, 7.2, -0.4, 8.8, 2.8, 7.8, SC.hair],
      [0, 3.6, -3.9, 8.4, 6.0, 2.4, SC.hair],
      [-4.5, 4.4, 0.2, 2.6, 4.8, 6.8, SC.hair],
      [4.5, 4.4, 0.2, 2.6, 4.8, 6.8, SC.hair]
    ];
    // voluminous curls: a deterministic cluster around the crown
    var curls = [
      [-3.6, 7.9, 0.6, 2.6], [-1.4, 8.3, 0.2, 2.4], [1.2, 8.4, -0.2, 2.6],
      [3.4, 7.9, 0.4, 2.4], [-4.4, 6.6, 1.8, 2.4], [-4.6, 5.2, -0.6, 2.6],
      [4.4, 6.6, 1.8, 2.4], [4.6, 5.2, -0.6, 2.6], [-2.8, 6.9, 3.1, 2.0],
      [0, 7.1, 3.4, 2.2], [2.8, 6.9, 3.1, 2.0], [0, 8.6, -2.6, 2.8],
      [-3.2, 8.0, -2.2, 2.2], [3.2, 8.0, -2.2, 2.2]
    ];
    for (var i = 0; i < curls.length; i++) {
      var q = curls[i];
      head.push([q[0], q[1], q[2], q[3], q[3], q[3], SC.hair2]);
    }
    var armL = [
      [0, -1.2, 0, 3.4, 2.8, 4.0, SC.tee2],
      [0, -3.9, 0, 2.9, 4.2, 3.3, SC.skin],
      [0, -6.3, 0.2, 3.0, 1.8, 3.0, SC.shade]
    ];
    var armR = armL.slice();
    armR.push([0, -4.9, 0, 3.3, 0.6, 3.6, SC.chain]);     // silver bracelet
    var legL = [
      [0, -3.4, 0, 4.2, 7.2, 4.6, SC.jeans],
      [0, -7.5, 0.4, 4.8, 2.8, 6.2, SC.shoe],
      [0, -7.3, 2.9, 4.8, 1.6, 1.8, SC.shoeRed],
      [0, -8.8, 0.3, 5.0, 0.7, 6.4, SC.sole]
    ];
    var legR = legL.slice();
    return { torso: torso, head: head, armL: armL, armR: armR, legL: legL, legR: legR };
  }

  function buildBT() {
    var torso = [
      [0, 12.3, 0, 9.0, 7.0, 5.2, BT.blouse],
      [0, 9.2, 0, 8.2, 1.2, 4.8, BT.trim],
      [0, 15.45, 2.35, 3.4, 1.2, 1.3, BT.blouse],
      [0, 14.9, 2.6, 1.5, 1.7, 0.6, BT.skin],
      [-3.9, 14.6, 0, 2.2, 2.2, 4.4, BT.blouse],
      [3.9, 14.6, 0, 2.2, 2.2, 4.4, BT.blouse],
      [-1.8, 12.8, 2.7, 0.8, 0.8, 0.3, BT.dot],
      [0.6, 13.4, 2.7, 0.8, 0.8, 0.3, BT.dot],
      [1.9, 12.1, 2.7, 0.7, 0.7, 0.3, BT.dot],
      [-0.7, 11.5, 2.7, 0.7, 0.7, 0.3, BT.dot],
      [2.6, 13.6, 2.7, 0.6, 0.6, 0.3, BT.dot]
    ];
    var head = [
      [0, 3.6, 0, 7.6, 7.0, 7.2, BT.skin],
      [-4.0, 3.5, 0, 0.8, 1.6, 1.4, BT.shade],
      [4.0, 3.5, 0, 0.8, 1.6, 1.4, BT.shade],
      [-1.7, 4.2, 3.65, 1.2, 1.2, 0.3, 0x2c211c],
      [1.7, 4.2, 3.65, 1.2, 1.2, 0.3, 0x2c211c],
      [-1.7, 4.95, 3.8, 1.4, 0.4, 0.3, 0x3b2a20],
      [1.7, 4.95, 3.8, 1.4, 0.4, 0.3, 0x3b2a20],
      [-1.8, 5.5, 3.8, 1.4, 0.4, 0.3, BT.hair2],
      [1.8, 5.5, 3.8, 1.4, 0.4, 0.3, BT.hair2],
      [0, 3.6, 3.9, 1.0, 1.1, 0.8, BT.shade],
      [0.2, 2.45, 3.8, 1.6, 0.5, 0.3, BT.mouth],
      [0, 7.3, -0.2, 8.4, 2.6, 7.6, BT.hair],
      [0, 6.5, 2.9, 7.8, 2.4, 2.0, BT.hair],
      [-2.6, 5.9, 3.25, 2.0, 3.4, 1.3, BT.hair],
      [2.9, 6.1, 3.2, 1.8, 3.6, 1.3, BT.hair],
      [-4.4, 2.6, 0.6, 2.6, 9.2, 5.6, BT.hair],
      [4.4, 2.6, 0.6, 2.6, 9.2, 5.6, BT.hair],
      [0, 2.6, -3.7, 7.6, 9.6, 2.4, BT.hair],
      [-3.6, -1.2, 1.4, 2.0, 2.4, 3.4, BT.hair],
      [3.6, -1.2, 1.4, 2.0, 2.4, 3.4, BT.hair],
      [0, 6.9, 3.9, 1.3, 1.8, 0.4, BT.hair2],
      [-2.4, 7.0, 3.8, 1.1, 1.4, 0.4, BT.hair2]
    ];
    var armL = [
      [0, -1.0, 0, 3.3, 2.6, 3.9, BT.blouse],
      [0, -3.6, 0, 2.8, 4.6, 3.2, BT.skin],
      [0, -6.2, 0.2, 2.8, 1.8, 3.0, BT.shade]
    ];
    var armR = armL.slice();
    var legL = [
      [0, -3.4, 0, 4.0, 7.2, 4.4, BT.jeans],
      [0, -7.5, 0.4, 4.6, 2.6, 5.8, BT.shoe],
      [0, -7.0, 2.6, 4.6, 0.6, 1.8, BT.stripe],
      [0, -8.8, 0.4, 4.8, 0.7, 6.0, BT.sole]
    ];
    var legR = legL.slice();
    return { torso: torso, head: head, armL: armL, armR: armR, legL: legL, legR: legR };
  }

  function makeCharacter(color) {
    var def = color === 'green' ? buildBT() : buildSC();
    var root = new THREE.Group();
    var holder = new THREE.Group();
    root.add(holder);

    var torsoMesh = meshOf(def.torso);
    var headMesh = meshOf(def.head);
    headMesh.position.y = 15.6;
    holder.add(torsoMesh, headMesh);

    function limb(parts, px, py) {
      var g = new THREE.Group();
      g.position.set(px, py, 0);
      g.add(meshOf(parts));
      holder.add(g);
      return g;
    }
    var armL = limb(def.armL, -5.0, 15.0);
    var armR = limb(def.armR, 5.0, 15.0);
    var legL = limb(def.legL, -2.2, 9.0);
    var legR = limb(def.legR, 2.2, 9.0);

    var bubble = new THREE.Group();
    var orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(11, 1),
      new THREE.MeshLambertMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.5, flatShading: true, emissive: 0x2f6f9c })
    );
    bubble.add(orb);
    // little highlight cubes so the bubble reads even over a bright sky
    bubble.add(meshOf([[-4.5, 5, 8.5, 3.2, 3.2, 1.2, 0xffffff]]));
    bubble.add(meshOf([[3.5, -1, 9.2, 1.8, 1.8, 1.2, 0xdff4ff]]));
    bubble.position.y = 11;
    bubble.visible = false;
    root.add(bubble);

    var shadow = new THREE.Mesh(
      new THREE.BoxGeometry(13, 1.4, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false })
    );
    shadow.position.y = 0.6;
    root.add(shadow);

    var marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(3.6, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd94a })
    );
    marker.visible = false;
    root.add(marker);

    /* Sujuk power: a ring of little gold cubes orbits the buddy while the
     * star is running, so the flashing body never has to carry the read on
     * its own. */
    var aura = new THREE.Group();
    /* a soft gold disc behind the body, then orbiting sparks in front */
    var halo = new THREE.Mesh(
      new THREE.CircleGeometry(19, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.32, depthWrite: false })
    );
    halo.position.set(0, 11, -9);
    aura.add(halo);
    for (var ai = 0; ai < 6; ai++) {
      var spark = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 3.4, 3.4),
        new THREE.MeshBasicMaterial({ color: ai % 2 ? 0xfff0a0 : 0xffc23a })
      );
      var aa = ai * 1.0472;
      spark.userData.ang = aa;
      aura.add(spark);
    }
    aura.visible = false;
    root.add(aura);

    /* A puff of voxel bits for the death pop. It lives in world space (not
     * inside root) so the shrinking, spinning body doesn't drag it around. */
    var puff = new THREE.Group();
    var puffBits = [];
    var bitGeo = new THREE.BoxGeometry(3.4, 3.4, 3.4);
    var bitMats = [
      new THREE.MeshLambertMaterial({ color: 0xfff3d8 }),
      new THREE.MeshLambertMaterial({ color: 0xffc45c })
    ];
    for (var bi = 0; bi < 8; bi++) {
      var bit = new THREE.Mesh(bitGeo, bitMats[bi % 2]);
      var ang = bi * 0.785;
      bit.userData.dir = {
        x: Math.cos(ang) * (7 + (bi % 3) * 3),
        y: 6 + (bi % 4) * 5,
        z: Math.sin(ang) * 5
      };
      bit.visible = true;
      puff.add(bit);
      puffBits.push(bit);
    }
    puff.visible = false;

    return {
      root: root, holder: holder, head: headMesh, bubble: bubble, marker: marker, shadow: shadow, aura: aura,
      armL: armL, armR: armR, legL: legL, legR: legR,
      puff: puff, puffBits: puffBits, koT: 0,
      phase: 0, yaw: 0.52, scale: 1, color: color
    };
  }

  function animateCharacter(c, x, y, p, dt, time, isMine) {
    var g = c.root;

    /* --- lost life: pop upward with a spin and a puff of voxels --- */
    if (p.state === 'ko' && !p.absent) {
      c.koT += dt;
      var kt = Math.min(1, c.koT / 0.55);
      var ease = 1 - (1 - kt) * (1 - kt);
      g.visible = kt < 0.98;
      g.position.set(x, y + ease * 34, 30);
      g.rotation.y = c.yaw + ease * 8.2;
      g.scale.setScalar(c.scale * (1 - 0.92 * kt));
      c.shadow.visible = false;
      c.bubble.visible = false;
      c.marker.visible = false;

      c.puff.visible = kt < 0.95;
      c.puff.position.set(x, y + 10, 30);
      for (var pi = 0; pi < c.puffBits.length; pi++) {
        var bit = c.puffBits[pi], d = bit.userData.dir;
        bit.position.set(d.x * ease, d.y * ease - 10 * ease * ease, d.z * ease);
        bit.scale.setScalar(Math.max(0.02, 1 - kt));
        bit.rotation.x = ease * 2.4;
        bit.rotation.z = ease * 1.7;
      }
      return;
    }
    c.koT = 0;
    c.puff.visible = false;
    c.shadow.visible = true;

    var ground = p.onGround !== false;
    var speed = Math.abs(p.vx || 0);
    c.phase += (0.6 + speed * 2.1) * dt * (ground ? 1 : 0.25);

    var swing = ground ? Math.min(1, speed / 2.2) : 0;
    var armAmp = 0.85 * swing, legAmp = 1.0 * swing;
    var armTargetL = Math.sin(c.phase) * armAmp;
    var armTargetR = -Math.sin(c.phase) * armAmp;
    var legTargetL = -Math.sin(c.phase) * legAmp;
    var legTargetR = Math.sin(c.phase) * legAmp;
    if (!ground) {
      armTargetL = -1.5; armTargetR = -1.5;
      legTargetL = (p.vy < 0) ? 0.75 : -0.5;
      legTargetR = (p.vy < 0) ? -0.35 : 0.35;
    }
    if (p.skid) { armTargetL = 1.4; armTargetR = 1.4; legTargetL = -1.2; }
    var k = Math.min(1, dt * 16);
    c.armL.rotation.z += (armTargetL - c.armL.rotation.z) * k;
    c.armR.rotation.z += (armTargetR - c.armR.rotation.z) * k;
    c.legL.rotation.z += (legTargetL - c.legL.rotation.z) * k;
    c.legR.rotation.z += (legTargetR - c.legR.rotation.z) * k;

    // body bob, squash and lean
    var bob = ground ? Math.abs(Math.sin(c.phase)) * 0.5 * swing : 0;
    c.holder.position.y = bob;
    var squash = p.squash > 0 ? 0.55 : 0;
    c.holder.scale.set(1 + squash * 0.16, 1 - squash * 0.22, 1 + squash * 0.16);
    c.holder.rotation.z = p.skid ? -0.12 : Math.max(-0.1, Math.min(0.1, (p.vx || 0) * 0.03));

    var targetScale = (p.big ? 1.12 : 1) * (c.color === 'green' ? 0.97 : 1);
    c.scale += (targetScale - c.scale) * Math.min(1, dt * 10);
    g.scale.setScalar(c.scale);

    var yawTarget = (p.face < 0 ? -1 : 1) * 0.52;
    c.yaw += (yawTarget - c.yaw) * Math.min(1, dt * 12);
    g.rotation.y = c.yaw;

    g.position.set(x, y, 30);
    g.visible = !p.absent;
    if (p.invuln > 0 && p.state === 'play') {
      g.visible = ((time * 20) | 0) % 8 < 5;
    }
    var starOn = (p.star || 0) > 0 && p.state === 'play';
    c.aura.visible = starOn;
    if (starOn) {
      /* fast flicker + an orbiting gold ring = unmistakable star power */
      g.visible = ((time * 26) | 0) % 5 < 4;
      for (var si = 0; si < c.aura.children.length; si++) {
        var sp = c.aura.children[si];
        if (!sp.userData || sp.userData.ang == null) {
          sp.position.set(0, 11, -9);
          sp.rotation.z += dt * 1.4;
          continue;
        }
        var ang = sp.userData.ang + time * 3.2;
        sp.position.set(Math.cos(ang) * 15, 11 + Math.sin(ang * 2 + time * 4) * 7, 12 + Math.sin(ang) * 6);
        sp.rotation.y += dt * 5;
      }
    }
    c.bubble.visible = p.state === 'bubble';
    c.bubble.rotation.y += dt * 0.7;
    c.bubble.position.y = 11 + Math.sin(time * 3) * 1.2;
    c.marker.visible = !!isMine && p.state === 'play' && !p.absent;
    c.marker.position.set(0, 27 + Math.sin(time * 4) * 1.6, 0);
    c.marker.rotation.y += dt * 2.4;
  }

  /* ------------------------------------------------------------------ */
  /* Enemies, pickups and props                                          */
  /* ------------------------------------------------------------------ */
  /* Themed pedestrians. Each city staffs its map with people who belong
   * there; every one of them is a stompable walker, and the green sheller
   * stays on every stage so the shell mechanic is always taught. Colours
   * are fixed (not per-stage) so a critter reads the same from either
   * palette. */
  var CRITTERS = {
    uncle: { skin: 0xd9a273, shirt: 0xf1e7d2, coat: 0x33405a, legs: 0x3a3f4a, hat: 0x8d2f2f, hair: 0x241a12, feet: 0x2b2620 },
    icecream: { skin: 0xdfb089, shirt: 0xc4362c, coat: 0xc4362c, legs: 0x2f3340, hat: 0xc4362c, hair: 0x2a2118, feet: 0x24252b },
    hoodlum: { skin: 0xcf9d73, shirt: 0x3b4358, coat: 0x272d3a, legs: 0x2b303c, hat: 0x1d222c, hair: 0x161a22, feet: 0x191d24 },
    grump: { skin: 0xe4bd97, shirt: 0xd7ccdf, coat: 0x9c8cb5, legs: 0x54506a, hat: 0xdadada, hair: 0xd0d0d0, feet: 0x4a4356 }
  };

  function critterParts(c, skin) {
    var p = [
      [-3.1, 1.5, 0, 4.4, 2.8, 5, c.legs],
      [3.1, 1.5, 0, 4.4, 2.8, 5, c.legs],
      [-3.1, 0.4, 0.5, 4.6, 1.6, 5.8, c.feet],
      [3.1, 0.4, 0.5, 4.6, 1.6, 5.8, c.feet],
      [0, 5.4, 0, 9.6, 5.4, 6.2, c.shirt],
      [-5.4, 5.2, 0, 2.4, 4.4, 4.6, c.shirt],
      [5.4, 5.2, 0, 2.4, 4.4, 4.6, c.shirt],
      [0, 10.5, 0, 8.2, 5.2, 8, c.skin],
      [-2, 11, 4.2, 1.3, 1.5, 0.5, 0x241a12],
      [2, 11, 4.2, 1.3, 1.5, 0.5, 0x241a12]
    ];
    if (skin === 'uncle') {
      p.push([0, 5.6, 3.1, 8.2, 4.8, 1.2, c.coat]);        // waistcoat
      p.push([0, 13.2, 0, 9.4, 1.7, 9, c.hat]);             // flat cap
      p.push([0, 12.4, 4.4, 9.4, 0.8, 3.2, c.hat]);         // peak
      p.push([-2.1, 9.4, 4.2, 3.1, 1.1, 0.9, c.hair]);      // handlebar moustache
      p.push([2.1, 9.4, 4.2, 3.1, 1.1, 0.9, c.hair]);
    } else if (skin === 'icecream') {
      p.push([0, 5.6, 3.1, 7.6, 4.6, 1.2, 0xfbf8f1]);       // apron
      p.push([0, 13.1, 0, 8.8, 1.9, 8.6, c.hat]);           // red fez
      p.push([6.5, 9.4, 1, 3, 2.8, 3, 0xd6b487]);           // cone in hand
      p.push([6.5, 12, 1, 3.2, 3.4, 3.2, 0xfaf6ee]);        // dondurma
      p.push([6.5, 14, 1, 2.8, 1.2, 2.8, 0xffffff]);
    } else if (skin === 'hoodlum') {
      p.push([0, 11, -2.6, 10.6, 7, 6, c.coat]);            // hood behind
      p.push([0, 13.3, 0, 9.2, 2.2, 8.6, c.hat]);           // beanie
      p.push([0, 11.1, 4.2, 7.4, 1.2, 0.6, 0x0f1218]);      // shades
      p.push([5.8, 3.4, 2.4, 2.4, 2.6, 2.4, 0xb9bdc4]);     // spray can
      p.push([5.8, 4.9, 2.4, 1.4, 0.8, 1.4, 0xc4362c]);
    } else if (skin === 'grump') {
      p.push([0, 5.4, 3.1, 8.6, 5, 1.2, c.coat]);           // cardigan
      p.push([-4.4, 11.6, 0, 2.6, 2.4, 7, c.hair]);
      p.push([4.4, 11.6, 0, 2.6, 2.4, 7, c.hair]);
      p.push([0, 13.2, 0, 8.4, 1.6, 8, c.hat]);
      p.push([0, 10.8, 4.2, 7, 1.2, 0.6, 0x1b1b1b]);        // glasses
      p.push([6.6, 4.6, 2.2, 1.3, 8.6, 1.3, 0x6b4a2f]);     // cane
      p.push([5.7, 8.9, 2.2, 2.4, 1.2, 1.2, 0x6b4a2f]);
    }
    return p;
  }

  function makeEnemy(type, skin) {
    var root = new THREE.Group();
    var c = skin ? CRITTERS[skin] : null;
    var body = meshOf(
      c ? critterParts(c, skin)
        : type === 'sheller'
        ? [
          [0, 7, 0, 14, 8, 14, 0x3f7d52],
          [0, 11, 0, 10, 3.4, 10, 0x51a065],
          [0, 3.4, 0, 15, 1.8, 15, 0xd9c9a0],
          [0, 6, 6.6, 5.6, 5, 5, 0xe0c07a],
          [-1.4, 7, 9.2, 1.3, 1.3, 0.4, 0x2a2119],
          [1.4, 7, 9.2, 1.3, 1.3, 0.4, 0x2a2119],
          [-4, 1.1, -1, 3.4, 2.2, 4.4, 0xd9c9a0],
          [4, 1.1, -1, 3.4, 2.2, 4.4, 0xd9c9a0]
        ]
        : [
          [0, 5.5, 0, 12, 8, 12, 0xc98b5b],
          [0, 10, 0, 14, 5, 14, 0xa8452f],
          [0, 12.6, 0, 9, 2.2, 9, 0xbd4f36],
          [-3, 6.6, 6.1, 2.6, 3, 0.5, 0xf5efe3],
          [3, 6.6, 6.1, 2.6, 3, 0.5, 0xf5efe3],
          [-3, 6.6, 6.5, 1.3, 1.6, 0.4, 0x241a12],
          [3, 6.6, 6.5, 1.3, 1.6, 0.4, 0x241a12],
          [-3.6, 1.1, 0, 4, 2.2, 5, 0x7d3a28],
          [3.6, 1.1, 0, 4, 2.2, 5, 0x7d3a28]
        ]
    );
    /* the mesh was built around a 14px critter; buddies are 22px, so scale
     * pedestrians up to the new people-sized hitbox (20px) and the plain
     * critters to 18px */
    body.scale.setScalar(skin ? 1.45 : 1.3);
    root.add(body);
    root.userData.critter = skin || type;
    /* a geometry (not a mesh) so it can be swapped onto the body mesh.
     * A stomped critter keeps this low shell silhouette while it sits and
     * while it slides, so kicking one never pops it back into a full body. */
    var shellGeo = mergeParts([
      [0, 4, 0, 14, 7, 14, type === 'sheller' ? 0x3f7d52 : 0xa8452f],
      [0, 7.5, 0, 9, 2.4, 9, type === 'sheller' ? 0x51a065 : 0xbd4f36],
      [0, 2, 0, 15, 1.6, 15, 0xd9c9a0]
    ]);
    return { root: root, body: body, type: type, skin: skin || '', shell: null, shellGeo: shellGeo, walkGeo: body.geometry };
  }

  /* a chunky crescent so it still reads while it spins */
  function bananaGeometry() {
    return mergeParts([
      [-0.6, -2.2, 0, 3.4, 4.4, 3.6, 0xf2cf4a],
      [1.3, 0.4, 0, 3.4, 3.4, 3.6, 0xf6d95c],
      [2.5, 2.4, 0, 2.8, 2.8, 3.2, 0xe8c23c],
      [2.9, 3.6, 0, 2.0, 2.0, 2.4, 0xd8ae30],
      [-1.9, -3.9, 0, 2.2, 2.2, 2.4, 0x8a5a2b],
      [-2.6, -4.6, 0, 1.6, 1.6, 1.8, 0x6f4720]
    ]);
  }

  /* The jar spins on the spot, so its identity has to survive every angle.
   * Three things do the work: a ribbed WHITE lid, a white label wrapping
   * all four sides with the spread wordmark on each face (navy 'n', red
   * letters), and dark chocolate glass showing above and below the label.
   * That palette read is what makes it recognisable at 14 pixels. */
  var NUTELLA_NAVY = 0x1b2440, NUTELLA_RED = 0xd21f26, LABEL_WHITE = 0xfbf7ee;

  function jarGeometry() {
    var parts = [
      [0, 4.3, 0, 9.8, 8.6, 9.8, 0x3a2116],       // chocolate glass body
      [0, 0.5, 0, 9.4, 1.0, 9.4, 0x22140d],       // base shadow
      [0, 9.2, 0, 8.9, 1.5, 8.9, 0x3a2116],       // shoulder
      [0, 10.3, 0, 7.2, 1.2, 7.2, 0x30200f],      // neck
      [0, 4.7, 0, 10.04, 5.2, 10.04, LABEL_WHITE],// white label wrapper
      [0, 2.55, 0, 10.06, 0.8, 10.06, NUTELLA_RED], // red rule along the base
      [0, 7.2, 0, 10.06, 0.5, 10.06, NUTELLA_RED],  // red rule under the rim
      [0, 12.1, 0, 8.8, 2.5, 8.8, 0xf6f3ea],       // white screw lid
      [0, 13.4, 0, 8.1, 0.4, 8.1, 0xffffff],       // lid top highlight
      /* lid ribbing, so the cap reads as a lid and not a white block */
      [-2.7, 12.1, 4.5, 0.55, 2.4, 0.5, 0xd9d3c4],
      [0, 12.1, 4.5, 0.55, 2.4, 0.5, 0xd9d3c4],
      [2.7, 12.1, 4.5, 0.55, 2.4, 0.5, 0xd9d3c4],
      [-2.7, 12.1, -4.5, 0.55, 2.4, 0.5, 0xd9d3c4],
      [0, 12.1, -4.5, 0.55, 2.4, 0.5, 0xd9d3c4],
      [2.7, 12.1, -4.5, 0.55, 2.4, 0.5, 0xd9d3c4],
      [4.5, 12.1, 0, 0.5, 2.4, 0.55, 0xd9d3c4],
      [-4.5, 12.1, 0, 0.5, 2.4, 0.55, 0xd9d3c4]
    ];

    /* lowercase wordmark: navy n then six red letters. Each glyph is a stem
     * plus a shoulder and t/l get an ascender, so the wordmark keeps the
     * up-and-down rhythm of real text instead of reading as a stripe. */
    var glyphs = [
      { w: 0.92, h: 1.75, c: NUTELLA_NAVY, dy: 0 },    // n
      { w: 0.92, h: 1.65, c: NUTELLA_RED, dy: 0 },     // u
      { w: 0.8, h: 2.1, c: NUTELLA_RED, dy: 0.2 },     // t
      { w: 0.92, h: 1.55, c: NUTELLA_RED, dy: 0 },     // e
      { w: 0.62, h: 2.15, c: NUTELLA_RED, dy: 0.22 },  // l
      { w: 0.62, h: 2.15, c: NUTELLA_RED, dy: 0.22 },  // l
      { w: 0.95, h: 1.6, c: NUTELLA_RED, dy: 0 }       // a
    ];
    var step = 1.17, startX = -3.94, baseY = 5.15, depth = 5.02;
    for (var gi = 0; gi < glyphs.length; gi++) {
      var gl = glyphs[gi];
      var gx = startX + gi * step;
      var gy = baseY + gl.dy;
      /* front + back faces: letters run left-to-right along X */
      parts.push([gx, gy, depth, gl.w, gl.h, 0.42, gl.c]);
      parts.push([-gx, gy, -depth, gl.w, gl.h, 0.42, gl.c]);
      /* side faces: same wordmark, running front-to-back along Z */
      parts.push([depth, gy, gx, 0.42, gl.h, gl.w, gl.c]);
      parts.push([-depth, gy, gx, 0.42, gl.h, gl.w, gl.c]);
    }

    /* a hazelnut and a knife-smeared toast square on the label face, the
     * little illustration the real jar carries under the wordmark */
    parts.push([-2.6, 3.55, depth, 2.1, 0.9, 0.42, 0xa9703c]);
    parts.push([-1.7, 3.9, depth, 1.2, 0.5, 0.42, 0x7a4a22]);
    parts.push([2.3, 3.5, depth, 3.0, 1.1, 0.42, 0xc4863f]);
    parts.push([1.9, 3.75, depth, 2.0, 0.55, 0.5, 0x4a2a16]);

    return mergeParts(parts);
  }

  /* ---- the four voxel foods ----------------------------------------
   * All four are built around the origin and spin on the spot, so they have
   * to read from every angle: a wide flat lahmacun with a lemon wedge and
   * tomato, a layered baklava diamond with green pistachio, a ribbed glass
   * of ayran with a mint sprig, and the dark red sujuk ring. */
  function lahmacunGeometry() {
    /* upright, like a plate held up to the camera: a flat disc built in the
     * XY plane reads as a round flatbread from the side view, while a
     * horizontal one would disappear to a one-pixel line whenever it spun */
    return mergeParts([
      [0, 0, 0, 18, 13, 1.8, 0xe6b06a],
      [0, 0, 0.9, 15.4, 11, 0.8, 0xb8432a],
      [0, 0, 1.4, 10, 7, 0.5, 0xa03520],
      [-4.5, 3.2, 1.3, 2.6, 2, 0.5, 0x3f7d3a],
      [4.2, -3.4, 1.3, 2.6, 2, 0.5, 0x3f7d3a],
      [0.5, -4.4, 1.3, 2, 2, 0.5, 0x3f7d3a],
      [6.4, 3.8, 1.5, 5, 4, 0.7, 0xffe066],
      [6.4, 6.2, 1.5, 3, 1.7, 0.7, 0xf7d24a],
      [-6.6, 2.2, 1.3, 3, 2, 0.7, 0xd94f3a]
    ]);
  }
  function baklavaGeometry() {
    return mergeParts([
      [0, -3.4, 0, 14, 3, 10, 0xc98a34],
      [0, -0.6, 0, 14, 2.6, 10, 0xe0a84a],
      [0, 1.6, 0, 12, 1.4, 8, 0xe8bf6a],
      [0, 2.8, 0, 10, 1.1, 7, 0x6fae4c],
      [0, -4.8, 0, 12, 1, 8, 0xa86a24],
      [-5, 0.6, 4, 3, 1, 2, 0xf0d08a],
      [5, 0.6, -4, 3, 1, 2, 0xf0d08a],
      [0, 3.7, 3, 6, 0.5, 3, 0x7dbb55]
    ]);
  }
  function ayranGeometry() {
    return mergeParts([
      [0, -2, 0, 9, 12, 9, 0xf4f3ec],
      [0, -8.2, 0, 9.6, 1.4, 9.6, 0xd9d7cd],
      [0, 4.2, 0, 9.8, 1.6, 9.8, 0xfbfaf4],
      [0, 5.6, 0, 9.0, 1.8, 9.0, 0xffffff],
      [0, 6.6, 1.5, 4, 1.4, 4, 0x3f8b46],
      [4.2, -4, 4.2, 1.2, 9, 1.2, 0xe6e4da],
      [-4.2, -4, 4.2, 1.2, 9, 1.2, 0xe6e4da],
      [4.2, -4, -4.2, 1.2, 9, 1.2, 0xe6e4da],
      [-4.2, -4, -4.2, 1.2, 9, 1.2, 0xe6e4da]
    ]);
  }
  function sujukGeometry() {
    return mergeParts([
      [-5.5, -1, 0, 4, 11, 4, 0x8e3327],
      [5.5, -1, 0, 4, 11, 4, 0x8e3327],
      [0, -6, 0, 15, 4, 4, 0x8e3327],
      [0, 4.5, 0, 11, 3.2, 4, 0x7a2a20],
      [-5.5, 1, 2, 1.5, 1.5, 1.5, 0xf0e2ce],
      [5.5, -3, 2, 1.5, 1.5, 1.5, 0xf0e2ce],
      [0, -6, 2, 2, 1.4, 1.4, 0xf0e2ce],
      [0, 6.4, 0, 2.4, 2, 1.6, 0xe9dcc8]
    ]);
  }
  var FOOD_GEOS = {
    lahmacun: lahmacunGeometry, baklava: baklavaGeometry,
    ayran: ayranGeometry, sujuk: sujukGeometry
  };

  function switchGroup() {
    var g = new THREE.Group();
    var base = meshOf([
      [0, 1.6, 0, 16, 3.2, 13, 0x59657a],
      [0, 3.1, 0, 15.6, 1.0, 12.6, 0xffd94a]
    ]);
    var rocker = new THREE.Group();
    rocker.add(meshOf([
      [0, 0.9, 0, 12.4, 1.8, 9.4, 0xdbe3ee],
      [0, 1.9, 0, 8.4, 0.8, 6.4, 0xffffff]
    ]));
    var lamp = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.2, 3.4),
      new THREE.MeshBasicMaterial({ color: 0xe23b2e })
    );
    lamp.position.set(0, 2.9, -4.4);
    g.add(base, rocker, lamp);
    g.userData = { rocker: rocker, lamp: lamp };
    return g;
  }

  function platformMesh(w) {
    var parts = [
      [0, -4, 0, w, 8, 14, 0x6e4b2a],
      [0, -1.2, 0, w, 2.6, 15, 0xa5713a],
      [0, 1.2, 0, w - 4, 1.4, 12, 0xc98d4c]
    ];
    var x;
    for (x = -w / 2 + 6; x <= w / 2 - 6; x += 24) {
      parts.push([x, -4.4, 7.2, 3, 3, 0.8, 0xffd94a]);
      parts.push([x, -4.4, -7.2, 3, 3, 0.8, 0xffd94a]);
    }
    parts.push([-w / 2 + 2, -3, 0, 4, 10, 12, 0x4f341c]);
    parts.push([w / 2 - 2, -3, 0, 4, 10, 12, 0x4f341c]);
    return meshOf(parts);
  }

  function flagGroup(kind) {
    var g = new THREE.Group();
    var poleH = kind === 'goal' ? 96 : 78;
    var pole = meshOf([
      [0, poleH / 2, 0, 2.6, poleH, 2.6, 0xd8dde6],
      [0, poleH + 3, 0, 5, 5, 5, 0xffd94a],
      [0, 1, 0, 8, 2, 8, 0x4b5566]
    ]);
    var flagMat = new THREE.MeshLambertMaterial({ color: 0x8b93a1 });
    var flag = new THREE.Mesh(new THREE.BoxGeometry(kind === 'goal' ? 17 : 14, kind === 'goal' ? 15 : 12, 2), flagMat);
    flag.position.set(kind === 'goal' ? 10 : 8.5, poleH - 12, 0);
    g.add(pole, flag);
    g.userData = { flag: flag, mat: flagMat };
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* Game renderer                                                       */
  /* ------------------------------------------------------------------ */
  function createRenderer(canvas) {
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      return null;
    }
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera(-VIEW_W / 2, VIEW_W / 2, VIEW_H / 2, -VIEW_H / 2, 1, 4200);
    camera.position.set(VIEW_W / 2, -VIEW_H / 2, CAM_Z);

    var hemi = new THREE.HemisphereLight(0xffffff, 0x6a5a48, 0.68);
    var sun = new THREE.DirectionalLight(0xfff3e0, 0.86);
    sun.position.set(-0.35, 1, 0.9);
    var fill = new THREE.DirectionalLight(0xd8e6ff, 0.42);
    fill.position.set(0.9, 0.25, 0.8);
    scene.add(hemi, sun, fill);

    var stage = STAGES[0];
    var stageId = null;
    var backdrop = new THREE.Group();
    scene.add(backdrop);
    var backdropLayers = [];

    var tileMesh = null;
    var tileSig = '';
    var gateGroup = null;
    var gateBaseY = 0;

    var chars = [makeCharacter('red'), makeCharacter('green')];
    chars.forEach(function (c) { scene.add(c.root); scene.add(c.puff); });

    /* One mesh per critter, built to match its type. The old fixed pool of
     * walkers drew every sheller with the walker sprite, so the green shell
     * creature only appeared after it had been stomped. */
    var enemies = [];
    function ensureEnemies(list) {
      for (var i = 0; i < list.length; i++) {
        var want = list[i].type === 'sheller' ? 'sheller' : 'walker';
        var wantSkin = list[i].skin || '';
        var have = enemies[i];
        if (have && have.type === want && have.skin === wantSkin) continue;
        if (have) scene.remove(have.root);
        var m = makeEnemy(want, wantSkin);
        m.root.visible = false;
        scene.add(m.root);
        enemies[i] = m;
      }
      for (var j = list.length; j < enemies.length; j++) if (enemies[j]) enemies[j].root.visible = false;
    }

    var coinGeo = bananaGeometry();
    var coinMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    var coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, 220);
    coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    coinMesh.frustumCulled = false;
    scene.add(coinMesh);

    var jarMesh = new THREE.Mesh(jarGeometry(), VOXEL_MAT);
    jarMesh.visible = false;
    /* a touch over one tile so the label and lid stay readable at play size */
    jarMesh.scale.setScalar(1.3);
    scene.add(jarMesh);

    /* one mesh per authored food pickup, geometry picked by its type */
    var foodMeshes = [];
    function ensureFoods(list) {
      for (var i = 0; i < list.length; i++) {
        var f = list[i];
        var have = foodMeshes[i];
        if (!have || have.userData.type !== f.type) {
          if (have) scene.remove(have);
          var mk = FOOD_GEOS[f.type] || FOOD_GEOS.baklava;
          var m = new THREE.Mesh(mk(), VOXEL_MAT);
          m.userData.type = f.type;
          m.scale.setScalar(1.2);
          scene.add(m);
          foodMeshes[i] = m;
          have = m;
        }
        have.visible = !f.taken;
      }
      for (var j = list.length; j < foodMeshes.length; j++) if (foodMeshes[j]) foodMeshes[j].visible = false;
    }

    var platforms = [];
    for (var pi = 0; pi < 3; pi++) {
      var pm = platformMesh(48);
      scene.add(pm);
      platforms.push(pm);
    }
    var switches = [switchGroup(), switchGroup()];
    switches.forEach(function (s) { scene.add(s); });
    var flags = { mid: flagGroup('mid'), goal: flagGroup('goal') };
    scene.add(flags.mid, flags.goal);

    var tmpM = new THREE.Matrix4();
    var tmpQ = new THREE.Quaternion();
    var tmpE = new THREE.Euler();
    var tmpV = new THREE.Vector3();
    var tmpS = new THREE.Vector3();
    var camX = 0, time = 0;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var Cam = global.LeapCam || null;
    /* canvas size in CSS pixels, refreshed on resize; the zoom maths works
     * from these instead of the drawing-buffer size */
    var cssW = 0, cssH = 0;
    var halfWNow = 0, halfHNow = 0, centerNow = 0, appliedHalfW = -1;
    var baseHalfWNow = VIEW_W / 2;   /* the old fixed framing, for zoom = 1 */
    var zoomOn = true;
    try {
      if (/[?&]zoom=0\b/.test((global.location && global.location.search) || '')) zoomOn = false;
    } catch (eZ) { /* no location (headless) — keep the zoom on */ }

    /* A fixed three-quarter angle is what makes flat boxes read as voxels:
     * it exposes the side and top faces, which the directional light
     * shades differently. Still a locked side-view camera — no free look. */
    var CAM_YAW = 0.30, CAM_PITCH = 0.075;

    function buildBackdrop() {
      while (backdrop.children.length) {
        var old = backdrop.children.pop();
        if (old.geometry) old.geometry.dispose();
        if (old.material) old.material.dispose();
      }
      backdropLayers.length = 0;
      scene.background = skyTexture(stage.sky);
      /* skylines are generated with the base at y=0; drop them so the
       * horizon sits on the level's ground line, not above the view */
      var HORIZON = -244;
      var defs = [
        { f: 0.16, z: -900 },
        { f: 0.34, z: -620 },
        { f: 0.56, z: -360 }
      ];
      for (var li = 0; li < defs.length; li++) {
        var rnd = rngFrom(stage.seed + li * 977);
        var list = skyline(stage, li, rnd);
        var haze = [0.55, 0.3, 0.08][li];
        var skyCol = C(stage.sky[1]);
        for (var bi = 0; bi < list.length; bi++) {
          list[bi][1] += HORIZON;
          var bc = C(list[bi][5]);
          bc.lerp(skyCol, haze);
          list[bi][5] = bc;
        }
        if (li === 0) {
          list.push([-200, HORIZON - 46, 3600, 120, 40, stage.far]);     // distant land band
        }
        if (li === 1) {
          list.push([-200, HORIZON - 58, 3600, 96, 30, stage.mid]);
        }
        var mesh = instancedBoxes(list);
        mesh.position.z = defs[li].z;
        mesh.position.y = defs[li].z * Math.sin(CAM_PITCH);   // undo the camera tilt
        backdrop.add(mesh);
        backdropLayers.push({ mesh: mesh, factor: defs[li].f, baseY: mesh.position.y });
      }
    }

    /* per-block tint: neighbouring tiles catch the light slightly
     * differently, so a long wall reads as stacked cubes, not a slab */
    function tint(hex, tx, ty, depthFade) {
      var h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
      var f = 0.93 + (h % 100) / 100 * 0.13;
      if (depthFade) f *= 0.9;
      var c = C(hex);
      c.multiplyScalar(f);
      return c;
    }

    function buildTiles(st) {
      var pal = stage.tile;
      var list = [];
      var T = global.Engine.T;
      /* gate tiles are drawn as the animated gate model below */
      for (var ty = 0; ty < st.levelH; ty++) {
        for (var tx = 0; tx < st.levelW; tx++) {
          var v = st.tiles[ty * st.levelW + tx];
          if (!v) continue;
          if (v === T.GATE) continue;
          var x = tx * TILE + 8;
          var yTop = -(ty * TILE);
          var deep = ty > 17;
          if (v === T.SOLID) {
            var above = ty > 0 ? st.tiles[(ty - 1) * st.levelW + tx] : 0;
            var surface = above === 0 || above === T.GATE;
            list.push([x, yTop - 10, 3, 16, 12, 22, tint(pal.solid, tx, ty, deep)]);
            if (surface) list.push([x, yTop - 2, 2, 16.4, 4.2, 22.4, tint(pal.cap, tx, ty)]);
          } else if (v === T.BRICK) {
            list.push([x, yTop - 8, 3, 15.2, 15.2, 20, tint(pal.brick, tx, ty)]);
            list.push([x, yTop - 4.4, 13.2, 14.4, 1.1, 0.8, 0x8f4a2f]);
          } else if (v === T.QBLOCK) {
            list.push([x, yTop - 8, 3, 15.2, 15.2, 20, pal.q]);
            list.push([x, yTop - 3.2, 13.2, 1.8, 1.8, 0.8, 0x5a3a12]);
            list.push([x, yTop - 7, 13.2, 1.8, 3.6, 0.8, 0x5a3a12]);
            list.push([x, yTop - 10, 13.2, 4.2, 2, 0.8, 0x5a3a12]);
          } else if (v === T.PBLOCK) {
            list.push([x, yTop - 8, 3, 15.2, 15.2, 20, pal.p]);
            list.push([x, yTop - 8, 13.2, 3, 3, 0.8, 0x9a5520]);
            list.push([x, yTop - 6.4, 13.2, 1.4, 1.4, 0.8, 0xf7e3b0]);
          } else {
            list.push([x, yTop - 8, 3, 15.2, 15.2, 20, tint(pal.used, tx, ty, deep)]);
            list.push([x, yTop - 2.2, 3, 14.4, 1.2, 20, 0x6d5c48]);
          }
        }
      }
      var geo = new THREE.BoxGeometry(1, 1, 1);
      var mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      var mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      var m = new THREE.Matrix4(), q = new THREE.Quaternion();
      var p = new THREE.Vector3(), s = new THREE.Vector3();
      for (var k = 0; k < list.length; k++) {
        var b = list[k];
        p.set(b[0], b[1], b[2]);
        s.set(b[3], b[4], b[5]);
        m.compose(p, q, s);
        mesh.setMatrixAt(k, m);
        var tc = b[6];
        mesh.setColorAt(k, (tc && tc.isColor) ? tc : C(tc));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      if (tileMesh) {
        scene.remove(tileMesh);
        tileMesh.geometry.dispose();
        tileMesh.material.dispose();
      }
      tileMesh = mesh;
      scene.add(tileMesh);
    }

    function buildGate(gateX) {
      if (gateGroup) {
        scene.remove(gateGroup);
        gateGroup.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      }
      gateGroup = new THREE.Group();
      var pal = stage.tile;
      var parts = [];
      var barX = [-5.4, 0, 5.4];
      for (var i = 0; i < barX.length; i++) {
        parts.push([barX[i], -48, 0, 5.0, 96, 11, 0x8b97a9]);
        parts.push([barX[i], -46, 5.9, 2.4, 86, 0.9, 0xe2ebf7]);
        parts.push([barX[i], -1.5, 0, 6.4, 5, 12.4, 0xffd94a]);
      }
      parts.push([0, -20, 0, 16, 3.4, 12.4, 0x4f5868]);
      parts.push([0, -52, 0, 16, 3.4, 12.4, 0x4f5868]);
      parts.push([0, -84, 0, 16, 3.4, 12.4, 0x4f5868]);
      parts.push([-4.6, -52, 6.4, 3, 3, 0.9, 0xff7a59]);
      parts.push([4.6, -52, 6.4, 3, 3, 0.9, 0xff7a59]);
      gateGroup.add(meshOf(parts));
      gateBaseY = -(9 * TILE);
      gateGroup.position.set(gateX * TILE + 8, gateBaseY, 0);
      scene.add(gateGroup);
    }

    function rebuildStatic(st) {
      buildBackdrop();
      buildTiles(st);
      buildGate(st.gateTx);
      for (var i = 0; i < platforms.length; i++) {
        scene.remove(platforms[i]);
        platforms[i].traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
        platforms[i] = platformMesh(st.platforms[i].w);
        scene.add(platforms[i]);
      }
    }

    function setStage(st, id) {
      stage = stageById(id);
      stageId = stage.id;
      rebuildStatic(st);
      tileSig = tileSignature(st);
    }

    function tileSignature(st) {
      var d = st.tileDiff, s = 0, n = 0;
      for (var k in d) { s += d[k] * 7 + (k | 0) % 13; n++; }
      return n + ':' + s;
    }

    function resize() {
      var w = canvas.clientWidth || 1024;
      var h = canvas.clientHeight || 576;
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      cssW = w; cssH = h;
      /* The frustum is rebuilt on the next draw, where the zoom lives.
       * Resetting the cache makes a rotation snap to the new framing. */
      halfWNow = 0; appliedHalfW = -1;
    }

    function lerpPos(prev, i, cur, kind, alpha) {
      if (!prev) return [cur.x, cur.y];
      var arr = prev[kind];
      if (!arr || !arr[i]) return [cur.x, cur.y];
      var a = alpha;
      return [
        arr[i][0] + (cur.x - arr[i][0]) * a,
        arr[i][1] + (cur.y - arr[i][1]) * a
      ];
    }

    function draw(st, opts) {
      if (!st) { renderer.clear(); return; }
      opts = opts || {};
      time += Math.min(0.05, opts.dt || 0.016);
      var alpha = opts.alpha == null ? 1 : Math.max(0, Math.min(1.15, opts.alpha));
      var prev = opts.prev || null;
      var shake = opts.shake || 0;

      if (st.stage && st.stage !== stageId) setStage(st, st.stage);
      if (!tileMesh) setStage(st, st.stage || 'izmir');
      var sig = tileSignature(st);
      if (sig !== tileSig) { tileSig = sig; buildTiles(st); }

      var dt = Math.min(0.1, opts.dt || 0.016);
      // camera follows the engine camera, with a whisper of sway
      var targetCam = st.camX;
      camX += (targetCam - camX) * Math.min(1, dt * 12);

      /* Zoom comes from js/camera.js: close enough that a buddy reads on a
       * phone, far enough out that a co-op partner never leaves the frame.
       * Zooming out is quick (so nobody is lost mid-leap); drifting back in
       * is slow, which keeps the picture calm while you run. */
      var fr = Cam ? Cam.frame({
        cssW: cssW || canvas.clientWidth || 1024,
        cssH: cssH || canvas.clientHeight || 576,
        levelW: (st.levelW || 200) * TILE,
        center: camX + VIEW_W / 2,
        players: st.players,
        zoom: zoomOn
      }) : null;
      var wantHalfW = fr ? fr.halfW : VIEW_W / 2;
      var wantHalfH = fr ? fr.halfH : VIEW_H / 2;
      baseHalfWNow = fr ? fr.baseHalfW : VIEW_W / 2;
      if (!halfWNow) {
        halfWNow = wantHalfW; halfHNow = wantHalfH;
        centerNow = fr ? fr.centerX : camX + VIEW_W / 2;
      } else {
        var k = Math.min(1, dt * (wantHalfW > halfWNow ? 12 : 4.5));
        halfWNow += (wantHalfW - halfWNow) * k;
        halfHNow += (wantHalfH - halfHNow) * k;
        centerNow += ((fr ? fr.centerX : camX + VIEW_W / 2) - centerNow) * Math.min(1, dt * 10);
      }
      if (Math.abs(halfWNow - appliedHalfW) > 0.05) {
        camera.left = -halfWNow; camera.right = halfWNow;
        camera.top = halfHNow; camera.bottom = -halfHNow;
        camera.updateProjectionMatrix();
        appliedHalfW = halfWNow;
      }
      var centerX = fr ? centerNow : camX + VIEW_W / 2;
      var swayX = Math.sin(time * 0.55) * 1.6 + shake * Math.sin(time * 40) * 3;
      var swayY = Math.sin(time * 0.9) * 1.2;
      /* bottom-anchored: the ground line stays put and zoom trims the sky */
      var cy = (fr ? -VIEW_H / 2 - fr.baseHalfH + halfHNow : -VIEW_H / 2) + swayY;
      camera.position.set(
        centerX + swayX + Math.sin(CAM_YAW) * Math.cos(CAM_PITCH) * CAM_Z,
        cy + Math.sin(CAM_PITCH) * CAM_Z,
        Math.cos(CAM_YAW) * Math.cos(CAM_PITCH) * CAM_Z
      );
      camera.lookAt(centerX + swayX * 0.6, cy + swayY * 0.25, 0);

      for (var li = 0; li < backdropLayers.length; li++) {
        var L = backdropLayers[li];
        L.mesh.position.x = -(centerX - VIEW_W / 2) * L.factor;
      }

      // gate
      if (gateGroup) {
        var open = st.gateOpen || 0;
        gateGroup.position.y = gateBaseY + open * 96;
        gateGroup.visible = open < 0.995;
      }

      // moving platforms
      for (var i = 0; i < st.platforms.length && i < platforms.length; i++) {
        var pl = st.platforms[i];
        /* the deck's top face is 1.9 units above the group origin, so drop
         * the group to put the visible surface exactly under the feet */
        platforms[i].position.set(pl.x + pl.w / 2, -pl.y + 1.9, 20);
      }

      // switches
      for (var s = 0; s < st.switches.length && s < switches.length; s++) {
        var sw = st.switches[s];
        var g = switches[s];
        g.position.set(sw.tx * TILE + 8, -sw.ty * TILE, 18);
        g.userData.rocker.position.y = sw.pressed ? -1.6 : 0.4;
        g.userData.lamp.material.color.setHex(sw.pressed ? 0x4ee06a : 0xe23b2e);
      }

      // flags
      var mid = flags.mid, goal = flags.goal;
      mid.position.set(st.midpointTx * TILE + 6, -(15 * TILE), 10);
      mid.userData.mat.color.setHex(st.midReached ? 0x4ee06a : 0x8b93a1);
      goal.position.set(st.goalTx * TILE + 6, -(st.goalTopTy * TILE), 10);
      goal.userData.mat.color.setHex(st.finished ? 0xffd94a : 0x8b93a1);

      // bananas
      var coins = st.coinsArr || [];
      var count = Math.min(coins.length, coinMesh.count);
      for (var ci = 0; ci < count; ci++) {
        var c = coins[ci];
        var shown = !c.taken;
        var bob = Math.sin(st.tick * 0.09 + ci) * 1.6;
        tmpE.set(0.22, st.tick * 0.035 + ci * 0.7, 0.32);
        tmpQ.setFromEuler(tmpE);
        tmpV.set(c.x + 5, -(c.y + 5) + bob, 22);
        tmpS.setScalar(shown ? 0.95 : 0.0001);
        tmpM.compose(tmpV, tmpQ, tmpS);
        coinMesh.setMatrixAt(ci, tmpM);
      }
      coinMesh.instanceMatrix.needsUpdate = true;

      // hazelnut spread jars
      var jars = st.berries || [];
      jarMesh.visible = jars.length > 0;
      if (jars.length) {
        var jb = jars[0];
        jarMesh.position.set(jb.x + 7, -(jb.y + 9) + Math.sin(st.tick * 0.12) * 1.2, 22);
        jarMesh.rotation.y = st.tick * 0.05;
      }

      // food pickups
      ensureFoods(st.foods || []);
      for (var fi2 = 0; fi2 < foodMeshes.length; fi2++) {
        var fm = foodMeshes[fi2], fd = st.foods[fi2];
        if (!fm || !fd || fd.taken) continue;
        fm.position.set(fd.x + 7, -(fd.y + 7) + Math.sin(st.tick * 0.11 + fi2) * 1.8, 23);
        /* props sway instead of spinning: a spinning flatbread turns edge-on
         * and disappears, and a food is not a coin anyway */
        fm.rotation.y = Math.sin(st.tick * 0.035 + fi2) * 0.34;
        fm.rotation.z = Math.sin(st.tick * 0.05 + fi2) * 0.08;
      }

      // enemies
      ensureEnemies(st.enemies || []);
      for (var ei = 0; ei < enemies.length; ei++) {
        var eg = enemies[ei];
        var en = st.enemies[ei];
        if (!en || en.dead) { eg.root.visible = false; continue; }
        var epos = lerpPos(prev, ei, en, 'enemies', alpha);
        eg.root.visible = true;
        eg.root.position.set(epos[0] + en.w / 2, -(epos[1] + en.h), 24);
        eg.root.scale.x = en.dir > 0 ? 1 : -1;
        var shell = en.state === 'shell' || en.state === 'slide';
        if (eg.shell !== shell) {
          eg.shell = shell;
          eg.body.geometry = shell ? eg.shellGeo : eg.walkGeo;
        }
        if (shell) {
          eg.root.position.y = -(epos[1] + 10);
          eg.body.rotation.z = 0;
        }
        if (en.state === 'slide') {
          eg.root.rotation.z += 0.25;
        } else if (shell) {
          eg.root.rotation.z = 0;
        } else {
          eg.root.rotation.z = 0;
          /* the walk tells you which critter you are dealing with: a seller
           * who has stopped to serve, a hoodlum leaning into a sprint, a
           * retiree backing off. Eased so the switch is not a snap. */
          var mode = en.mode || 'walk';
          /* the body is a child of a root that is mirrored for facing, so a
           * negative z-rotation leans *forward* in both directions */
          var lean = 0, bobNow = 0.9, bobRate = 0.22;
          if (mode === 'rest') { lean = 0; bobNow = 0.3; bobRate = 0.05; }
          else if (mode === 'dash') { lean = -0.22; bobNow = 1.5; bobRate = 0.46; }
          else if (mode === 'bolt') { lean = 0.16; bobNow = 0.6; bobRate = 0.34; }
          eg.body.rotation.z += (lean - eg.body.rotation.z) * 0.25;
          eg.root.position.y += Math.abs(Math.sin(st.tick * bobRate + ei)) * bobNow;
        }
      }

      // characters
      for (var pi2 = 0; pi2 < 2; pi2++) {
        var p = st.players[pi2];
        var ch = chars[pi2];
        if (!p || p.absent) { ch.root.visible = false; continue; }
        var ppos = lerpPos(prev, pi2, p, 'players', alpha);
        animateCharacter(ch, ppos[0] + p.w / 2, -(ppos[1] + p.h), p, Math.min(0.05, opts.dt || 0.016), time,
          opts.mine != null && opts.mine === pi2);
      }

      renderer.render(scene, camera);
    }

    /* world coordinates (x, and y with the simulation's screen-down axis) to stage pixels, so UI can be
     * pinned to a critter or a plate instead of to a guessed position. Uses
     * the camera's own matrices, so zoom and the split-pair framing hold. */
    function project(x, y) {
      if (!canvas) return null;
      var v = new THREE.Vector3(x, -y, 24).project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * canvas.clientWidth,
        y: (-v.y * 0.5 + 0.5) * canvas.clientHeight
      };
    }

    return {
      draw: draw,
      resize: resize,
      project: project,
      renderer: renderer,
      _dbg: {
        scene: scene, camera: camera, chars: chars, flags: flags, renderer: renderer,
        enemies: function () { return enemies; },
        stage: function () { return stage; },
        /* the framing currently on screen — used by the browser checks */
        frame: function () {
          return {
            halfW: halfWNow, halfH: halfHNow, centerX: centerNow,
            zoom: halfWNow ? baseHalfWNow / halfWNow : 1
          };
        }
      },
      stats: function () {
        return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, canvas: canvas };
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Character-select previews (one small renderer, blitted to cards)     */
  /* ------------------------------------------------------------------ */
  var preview = null;
  var previewCanvas = null;
  var previewScene = null;
  var previewCam = null;
  var previewChars = {};
  var previewAcc = 0;

  /* ---- keycaps for the How To Play panel ----
   * The cap itself is 3D; the legend is drawn in 2D over the projected top
   * face. Voxel-built letters turned to mush at 50 px, and a keyboard legend
   * has to be readable by someone who does not play games at all. */
  var CAP = { top: 0xe9ecf2, face: 0xc9ccd4, side: 0x8b8f9a, rim: 0xf7f9ff };
  var ARROWS = { left: 'left', right: 'right', up: 'up', down: 'down' };
  var keyScene = null, keyCam = null, keyAcc = 0;

  function keyGeometry() {
    return mergeParts([
      [0, 0.00, 0, 1.06, 0.32, 1.06, CAP.side],
      [0, 0.18, 0, 1.02, 0.16, 1.02, CAP.face],
      [0, 0.31, 0, 0.86, 0.12, 0.86, CAP.top],
      [0, 0.385, 0, 0.80, 0.02, 0.80, CAP.rim]
    ]);
  }

  /* The legend is a flat, unlit textured plate lying on the cap. Built as a
   * texture instead of boxes, the letter stays sharp at any canvas size and
   * inherits the cap's perspective for free. */
  var legendTex = {};
  function legendTexture(key) {
    if (legendTex[key]) return legendTex[key];
    var c = document.createElement('canvas');
    c.width = c.height = 192;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 192, 192);
    g.translate(96, 96);
    g.fillStyle = '#1c1f26';
    if (ARROWS[key]) {
      var t = 54;
      g.beginPath();
      if (key === 'up') { g.moveTo(0, -t); g.lineTo(t * 0.95, t * 0.55); g.lineTo(-t * 0.95, t * 0.55); }
      else if (key === 'left') { g.moveTo(-t, 0); g.lineTo(t * 0.55, t * 0.95); g.lineTo(t * 0.55, -t * 0.95); }
      else if (key === 'right') { g.moveTo(t, 0); g.lineTo(-t * 0.55, t * 0.95); g.lineTo(-t * 0.55, -t * 0.95); }
      else { g.moveTo(0, t); g.lineTo(t * 0.95, -t * 0.55); g.lineTo(-t * 0.95, -t * 0.55); }
      g.closePath();
      g.fill();
    } else {
      g.font = '800 132px ui-rounded, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(key, 0, 6);
    }
    var tex = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    legendTex[key] = tex;
    return tex;
  }

  function legendPlate(key) {
    var plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.62),
      new THREE.MeshBasicMaterial({ map: legendTexture(key), transparent: true, depthWrite: false })
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(0, 0.398, 0);
    return plate;
  }

  function initKeyScene() {
    if (keyScene) return keyScene;
    keyScene = new THREE.Scene();
    keyCam = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    /* high three-quarter view: the cap still reads as 3D, but the glyph on
     * top stays legible at 54 px instead of smearing into a blob */
    keyCam.position.set(0.92, 2.24, 1.58);
    keyCam.lookAt(0, 0.12, 0);
    /* Neutral, slightly soft light: the caps stay white instead of clipping,
     * and the dark legends keep their contrast at 50 px. */
    keyScene.add(new THREE.HemisphereLight(0xffffff, 0x565b68, 0.52));
    var k1 = new THREE.DirectionalLight(0xffffff, 0.42);
    k1.position.set(0.7, 1.2, 1.1);
    keyScene.add(k1);
    var k2 = new THREE.DirectionalLight(0xc9d6ff, 0.12);
    k2.position.set(-1, 0.3, 0.5);
    keyScene.add(k2);
    return keyScene;
  }

  function paintKeyCards(now) {
    if (typeof document === 'undefined') return 0;
    var cards = document.querySelectorAll('.key-preview');
    if (!cards.length) return 0;
    var r = initPreview();
    if (!r) return 0;
    initKeyScene();
    var painted = 0;
    for (var i = 0; i < cards.length; i++) {
      var cv = cards[i];
      if (!cv.offsetParent) continue;
      var w = Math.max(40, cv.clientWidth || 64);
      var h = Math.max(40, cv.clientHeight || 64);
      /* keycaps are tiny, so render them at extra resolution */
      var dpr = Math.min((global.devicePixelRatio || 1) * 2, 4);
      var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      var key = cv.getAttribute('data-key') || 'A';
      /* static keycaps: paint once per size, then skip — the menu stays cheap */
      var sig = key + '|' + bw + 'x' + bh;
      if (cv.__keySig === sig) continue;
      if (!cv.__keyMesh || cv.__keyMesh.userData.key !== sig) {
        cv.__keyMesh = new THREE.Mesh(keyGeometry(), VOXEL_MAT);
        cv.__keyMesh.userData.key = sig;
      }
      var mesh = cv.__keyMesh;
      /* face the camera's azimuth so the legend reads square, not skewed */
      mesh.rotation.y = 0.53;
      mesh.position.y = 0;
      mesh.clear();
      mesh.add(legendPlate(key));
      keyScene.add(mesh);
      r.setSize(bw, bh, false);
      keyCam.aspect = w / h;
      keyCam.updateProjectionMatrix();
      r.render(keyScene, keyCam);
      keyScene.remove(mesh);
      var g2 = cv.getContext('2d');
      g2.clearRect(0, 0, cv.width, cv.height);
      g2.drawImage(previewCanvas, 0, 0);
      cv.__keySig = sig;
      painted++;
    }
    return painted;
  }

  function initPreview() {
    if (preview) return preview;
    try {
      previewCanvas = document.createElement('canvas');
      previewCanvas.width = 320; previewCanvas.height = 400;
      preview = new THREE.WebGLRenderer({
        canvas: previewCanvas, antialias: true, alpha: true,
        preserveDrawingBuffer: true, powerPreference: 'low-power'
      });
    } catch (err) {
      preview = null;
      return null;
    }
    preview.setPixelRatio(1);
    preview.setSize(320, 400, false);
    if (THREE.sRGBEncoding) preview.outputEncoding = THREE.sRGBEncoding;
    preview.setClearColor(0x000000, 0);

    previewScene = new THREE.Scene();
    previewCam = new THREE.PerspectiveCamera(28, 0.8, 1, 400);
    previewCam.position.set(0, 16, 70);
    previewCam.lookAt(0, 11.8, 0);

    previewScene.add(new THREE.HemisphereLight(0xffffff, 0x5a4a3a, 0.85));
    var s1 = new THREE.DirectionalLight(0xfff4e2, 0.9);
    s1.position.set(0.6, 1.1, 1.2);
    previewScene.add(s1);
    var s2 = new THREE.DirectionalLight(0xa9c8ff, 0.35);
    s2.position.set(-1, 0.2, 0.4);
    previewScene.add(s2);

    var podium = new THREE.Mesh(new THREE.BoxGeometry(21, 2.8, 21),
      new THREE.MeshLambertMaterial({ color: C(0x3a4a72) }));
    podium.position.y = -1.5;
    previewScene.add(podium);
    var crown = new THREE.Mesh(new THREE.BoxGeometry(26, 1.4, 26),
      new THREE.MeshLambertMaterial({ color: C(0x27314d) }));
    crown.position.y = -3.2;
    previewScene.add(crown);

    previewChars.red = makeCharacter('red');
    previewChars.green = makeCharacter('green');
    var ids = ['red', 'green'];
    for (var i = 0; i < ids.length; i++) {
      var c = previewChars[ids[i]];
      c.root.position.set(0, 0, 0);
      c.root.visible = false;
      c.shadow.visible = false;
      c.bubble.visible = false;
      c.marker.visible = false;
      previewScene.add(c.root);
    }
    return preview;
  }

  function previewTick(now) {
    if (typeof document === 'undefined') return;
    if (now - previewAcc < 33) return;
    previewAcc = now;
    var cards = document.querySelectorAll('.char-preview');
    if (cards.length) paintCharCards(now, cards);
    /* keycaps animate more slowly than the cards, so they repaint less often */
    if (now - keyAcc > 90) {
      keyAcc = now;
      paintKeyCards(now);
    }
    /* guide icons are static: each canvas paints once per size, and only
     * while the sheet is actually on screen */
    if (now - guideArtAcc > 120) {
      guideArtAcc = now;
      paintGuideArt(now);
    }
  }

  function paintCharCards(now, cards) {
    var r = initPreview();
    if (!r) return;

    var red = previewChars.red, green = previewChars.green;
    var spin = Math.sin(now * 0.0008) * 0.9;
    var bob = Math.sin(now * 0.0022) * 0.35;
    [red, green].forEach(function (c) {
      c.root.rotation.y = spin;
      c.holder.position.y = bob;
      c.holder.rotation.z = 0;
      c.armL.rotation.z = 0.12 + Math.sin(now * 0.002) * 0.08;
      c.armR.rotation.z = -0.12 - Math.sin(now * 0.002) * 0.08;
    });

    for (var i = 0; i < cards.length; i++) {
      var cv = cards[i];
      if (!cv.offsetParent) continue;
      var color = cv.getAttribute('data-color') === 'green' ? 'green' : 'red';
      red.root.visible = color === 'red';
      green.root.visible = color === 'green';

      var w = Math.max(80, cv.clientWidth || 120);
      var h = Math.max(100, cv.clientHeight || 150);
      var dpr2 = Math.min(global.devicePixelRatio || 1, 2);
      var bw = Math.round(w * dpr2), bh = Math.round(h * dpr2);
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      r.setSize(bw, bh, false);
      previewCam.aspect = w / h;
      previewCam.updateProjectionMatrix();
      r.render(previewScene, previewCam);
      var g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(previewCanvas, 0, 0);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Field-guide art: the same voxel models, rendered once into a icon    */
  /* ------------------------------------------------------------------ */
  /* A star drawn as a 9x9 pixel stamp, extruded: readable at 48 px and
   * unmistakably the same gold the HUD uses. */
  function starGeometry() {
    var FLAG = [
      '....#....',
      '...###...',
      '...###...',
      '#########',
      '.#######.',
      '..#####..',
      '..#####..',
      '.##...##.',
      '.#.....#.'
    ];
    var px = 2.2, parts = [];
    for (var r = 0; r < FLAG.length; r++) {
      for (var c = 0; c < FLAG[r].length; c++) {
        if (FLAG[r].charAt(c) !== '#') continue;
        var col = r < 2 ? 0xfff0b0 : r > 5 ? 0xd9a52e : 0xffd24a;
        parts.push([(c - 4) * px, (4 - r) * px, 0, px * 1.04, px * 1.04, 3.6, col]);
      }
    }
    return mergeParts(parts);
  }

  function starsArt() {
    var g = new THREE.Group();
    var geo = starGeometry();
    var scales = [0.82, 1.05, 0.82];
    for (var i = 0; i < 3; i++) {
      var m = new THREE.Mesh(geo, VOXEL_MAT);
      m.scale.setScalar(scales[i]);
      m.position.set((i - 1) * 15, i === 1 ? 1.6 : -1.4, 0);
      g.add(m);
    }
    return g;
  }

  /* checkpoint flag: the same pole-and-cloth the midpoint prints in world */
  function flagArt() {
    var g = new THREE.Group();
    g.add(meshOf([
      [0, 11, 0, 2.4, 22, 2.4, 0xd9c9a0],
      [0, 0.8, 0, 12, 2.4, 12, 0x6f7a92],
      [7.6, 18, 0, 13, 6, 1.8, 0xffd24a],
      [7.6, 14.2, 0, 11, 3, 1.8, 0xffb84d]
    ]));
    return g;
  }

  /* the co-op bubble, with the same highlight cubes the stage uses */
  function bubbleArt() {
    var g = new THREE.Group();
    var orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(12, 1),
      new THREE.MeshLambertMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.48, flatShading: true, emissive: 0x2f6f9c })
    );
    g.add(orb);
    g.add(meshOf([[-5, 5.5, 9, 3.4, 3.4, 1.4, 0xffffff]]));
    g.add(meshOf([[4, -1.5, 9.6, 2, 2, 1.4, 0xdff4ff]]));
    return g;
  }

  function foodArt(type) {
    return new THREE.Mesh(FOOD_GEOS[type](), VOXEL_MAT);
  }

  var GUIDE_ART = {
    'stars': starsArt,
    'flag': flagArt,
    'bubble': bubbleArt,
    'lahmacun': function () { return foodArt('lahmacun'); },
    'baklava': function () { return foodArt('baklava'); },
    'ayran': function () { return foodArt('ayran'); },
    'sujuk': function () { return foodArt('sujuk'); },
    'icecream': function () { return makeEnemy('walker', 'icecream').root; },
    'uncle': function () { return makeEnemy('walker', 'uncle').root; },
    'grump': function () { return makeEnemy('walker', 'grump').root; },
    'hoodlum': function () { return makeEnemy('walker', 'hoodlum').root; },
    'sheller': function () { return makeEnemy('sheller').root; }
  };
  var ART_SPIN = { 'stars': 0.16, 'flag': 0.5, 'bubble': 0.2 };

  var guideArtScene = null, guideArtCam = null, guideArtCache = {};
  var guideArtAcc = 0;

  function initGuideArtScene() {
    if (guideArtScene) return guideArtScene;
    guideArtScene = new THREE.Scene();
    guideArtCam = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
    guideArtScene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a4a, 0.95));
    var a1 = new THREE.DirectionalLight(0xfff4e2, 0.85);
    a1.position.set(0.6, 1.1, 1.2);
    guideArtScene.add(a1);
    var a2 = new THREE.DirectionalLight(0xa9c8ff, 0.4);
    a2.position.set(-1, 0.3, 0.6);
    guideArtScene.add(a2);
    return guideArtScene;
  }

  function paintGuideArt(now) {
    if (typeof document === 'undefined') return 0;
    var cards = document.querySelectorAll('.guide-art');
    if (!cards.length) return 0;
    var modal = document.getElementById('guide-modal');
    if (modal && modal.classList.contains('hidden')) return 0;
    var r = initPreview();
    if (!r) return 0;
    initGuideArtScene();
    var painted = 0;
    for (var i = 0; i < cards.length; i++) {
      var cv = cards[i];
      if (!cv.offsetParent) continue;
      var id = cv.getAttribute('data-art');
      var make = GUIDE_ART[id];
      if (!make) continue;
      var w = Math.max(24, cv.clientWidth || 48);
      var h = Math.max(24, cv.clientHeight || 48);
      var dpr = Math.min((global.devicePixelRatio || 1) * 2, 3);
      var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      var sig = id + '|' + bw + 'x' + bh;
      if (cv.__artSig === sig) continue;
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }

      var obj = guideArtCache[id];
      if (!obj) { obj = make(); guideArtCache[id] = obj; }
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
      var box = new THREE.Box3().setFromObject(obj);
      var size = box.getSize(new THREE.Vector3());
      var center = box.getCenter(new THREE.Vector3());
      obj.position.set(-center.x, -center.y, -center.z);

      var holder = new THREE.Group();
      holder.add(obj);
      holder.rotation.y = ART_SPIN[id] != null ? ART_SPIN[id] : 0.5;
      guideArtScene.add(holder);

      /* frame by the model, not by a guessed distance: tall pedestrians and
       * the wide three-star row both fill their box without clipping */
      var vFov = guideArtCam.fov * Math.PI / 180;
      var distV = (size.y / 2) / Math.tan(vFov / 2);
      var distH = (size.x / 2) / Math.tan(Math.atan(Math.tan(vFov / 2) * (w / h)));
      var dist = Math.max(distV, distH, 12) * 1.28 + size.z;
      guideArtCam.position.set(dist * 0.34, dist * 0.2, dist * 0.92);
      guideArtCam.aspect = w / h;
      guideArtCam.updateProjectionMatrix();
      guideArtCam.lookAt(0, 0, 0);

      r.setSize(bw, bh, false);
      r.render(guideArtScene, guideArtCam);
      guideArtScene.remove(holder);

      var g2 = cv.getContext('2d');
      g2.clearRect(0, 0, cv.width, cv.height);
      g2.drawImage(previewCanvas, 0, 0);
      cv.__artSig = sig;
      painted++;
    }
    return painted;
  }

  global.Render3D = {
    STAGES: STAGES.map(function (s) { return { id: s.id, name: s.name, tag: s.tag }; }),
    createRenderer: createRenderer,
    previewTick: previewTick,
    paintKeyCards: paintKeyCards,
    paintGuideArt: paintGuideArt,
    hasThree: !!THREE
  };
})(typeof window !== 'undefined' ? window : globalThis);
