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
  var LEVEL_W = 300, LEVEL_H = 18;

  /* Every buddy has three stars. A hit costs one, a fall costs the whole
   * bar (down), and the bar refills at a checkpoint respawn. */
  var MAX_HEARTS = 3;
  var STAR_TICKS = 600;                  // 10 seconds of sujuk power

  /* Voxel food. Lahmacun is a full heal, baklava one star, ayran a spare
   * life and sujuk the invincibility star. */
  var FOODS = {
    lahmacun: { heal: 3, score: 500 },
    baklava: { heal: 1, score: 250 },
    ayran: { life: 1, score: 100 },
    sujuk: { star: STAR_TICKS, score: 300 }
  };

  /* Co-op catch-up rule. When the two players split further than
   * SPLIT_FOLLOW the camera follows whoever is ahead, and once the one
   * behind is off the left edge (CARRY_GAP) they are swept up in a carry
   * bubble and floated back to their partner, so nobody can drag the
   * camera backwards or get stranded off-screen. */
  var SPLIT_FOLLOW = 190;
  var CARRY_GAP = 250;

  /* Shared stage anchors. The two plates at 63/66 open the gate at 70; the
   * midpoint flag stands at 160 and the goal plateau starts at 289. */
  var GATE_TX = 70, MID_TX = 160, GOAL_TX = 289;

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

  /* ------------------------------------------------------------------ */
  /* Stage layouts                                                       */
  /*                                                                    */
  /* Each city is a full-length course (300 tiles, about 1.5x World 1-1)  */
  /* with two routes through it: a street/beach lane at the ground line   */
  /* and a roof/terrace lane six rows above it, joined by stair pillars.  */
  /* Four anchors never move, because the gate rule, the checkpoint and  */
  /* the goal test depend on them: the gate tower at tx 70, its two floor */
  /* plates at 63/66, the midpoint flag at 160 and the goal plateau from  */
  /* 289.                                                                */
  /*                                                                    */
  /* Height discipline (checked by the smoke test): the ground surface   */
  /* is row 15, roofs are row 9, so a roof is 96px up with five clear     */
  /* rows under it. Nothing is stacked closer than three rows above a    */
  /* walkable surface, which is what keeps low ceilings out of the game. */
  /* ------------------------------------------------------------------ */
  var STAGE_LAYOUTS = {
    /* İzmir — sunset coast. Wide sand, short pier roofs on stilts, and
     * dondurma stands on the promenade. */
    izmir: function () {
      var coins = [], blocks = [];
      /* A — the beach opening */
      blocks.push([5, 11, 1, 1, 'brick'], [6, 11, 1, 1, 'q'], [7, 11, 1, 1, 'brick'], [8, 11, 1, 1, 'p']);
      blocks.push([16, 12, 2, 3]);                       // stair pillar
      blocks.push([18, 9, 8, 1]);                        // pier roof 18..25
      /* B — the second pier */
      blocks.push([34, 12, 2, 3]);
      blocks.push([36, 9, 9, 1]);                        // roof 36..44
      /* C — switch plaza, kept flat so both plates read clearly */
      blocks.push([56, 11, 2, 1], [58, 10, 2, 1]);
      /* D — beyond the gate */
      blocks.push([74, 12, 2, 3]);
      blocks.push([78, 9, 10, 1]);                       // roof 78..87
      /* E — the long surf gap */
      blocks.push([94, 13, 3, 2], [98, 12, 2, 3], [100, 9, 9, 1]);
      /* F — dondurma stands, then a pier */
      blocks.push([118, 13, 4, 2], [122, 11, 3, 1]);
      blocks.push([125, 12, 2, 3], [127, 9, 8, 1]);
      /* G — ruined bridge */
      blocks.push([140, 11, 4, 1], [144, 12, 2, 3], [146, 9, 5, 1]);
      /* H — midpoint plaza */
      blocks.push([164, 11, 4, 1], [168, 10, 3, 1]);
      /* I — the cliff stairs */
      blocks.push([182, 12, 2, 3], [184, 9, 7, 1], [192, 11, 3, 1]);
      /* J — cliff road */
      blocks.push([202, 11, 3, 1], [208, 12, 2, 3], [210, 9, 7, 1]);
      /* K — palm decks */
      blocks.push([224, 11, 4, 1], [227, 12, 2, 3], [229, 9, 7, 1], [236, 11, 3, 1]);
      /* L — the last pier */
      blocks.push([246, 11, 3, 1], [250, 12, 2, 3], [252, 9, 5, 1]);
      /* M — lighthouse approach */
      blocks.push([268, 11, 3, 1], [274, 12, 2, 3], [276, 9, 4, 1]);
      /* N — the flag steps */
      blocks.push([283, 13, 2, 2], [285, 11, 2, 1], [287, 9, 2, 1]);

      row(coins, 6, 8, 13); row(coins, 12, 15, 10);
      row(coins, 18, 25, 8);
      row(coins, 32, 33, 13); row(coins, 36, 44, 8);
      row(coins, 56, 59, 9);
      row(coins, 74, 77, 10); row(coins, 78, 87, 8);
      row(coins, 94, 96, 12); row(coins, 100, 108, 8);
      row(coins, 118, 121, 12); row(coins, 127, 134, 8);
      row(coins, 140, 143, 10); row(coins, 146, 150, 8);
      row(coins, 160, 163, 13); row(coins, 168, 170, 9);
      row(coins, 184, 190, 8); row(coins, 192, 194, 10);
      row(coins, 202, 204, 10); row(coins, 210, 216, 8);
      row(coins, 224, 226, 10); row(coins, 229, 235, 8); row(coins, 236, 238, 10);
      row(coins, 246, 248, 10); row(coins, 252, 256, 8);
      row(coins, 268, 270, 10); row(coins, 276, 279, 8);
      row(coins, 285, 288, 8);

      return {
        grounds: [[0, 26], [32, 46], [52, 68], [70, 88], [94, 110], [116, 132],
                  [138, 152], [158, 172], [178, 194], [200, 216], [222, 238],
                  [244, 260], [265, 282], [285, 299]],
        blocks: blocks,
        coins: coins,
        enemies: [
          { type: 'walker', tx: 14 },
          { type: 'walker', skin: 'icecream', tx: 21, ty: 9 },
          { type: 'walker', tx: 32 },
          { type: 'walker', skin: 'icecream', tx: 40, ty: 9 },
          { type: 'sheller', tx: 57 },
          { type: 'walker', tx: 66 },
          { type: 'walker', skin: 'icecream', tx: 81, ty: 9 },
          { type: 'walker', tx: 87 },
          { type: 'sheller', tx: 104, ty: 9 },
          { type: 'walker', tx: 108 },
          { type: 'walker', skin: 'icecream', tx: 120, ty: 13 },
          { type: 'walker', tx: 131, ty: 9 },
          { type: 'sheller', tx: 143 },
          { type: 'walker', tx: 148, ty: 9 },
          { type: 'walker', skin: 'icecream', tx: 166, ty: 12 },
          { type: 'walker', tx: 187, ty: 9 },
          { type: 'sheller', tx: 193 },
          { type: 'walker', tx: 213, ty: 9 },
          { type: 'walker', skin: 'icecream', tx: 218 },
          { type: 'walker', tx: 231, ty: 9 },
          { type: 'sheller', tx: 240 },
          { type: 'walker', tx: 253, ty: 9 },
          { type: 'walker', skin: 'icecream', tx: 266 },
          { type: 'walker', tx: 277, ty: 9 },
          { type: 'walker', tx: 281 }
        ],
        foods: [
          { type: 'baklava', tx: 84, ty: 8 },
          { type: 'lahmacun', tx: 131, ty: 8 },
          { type: 'sujuk', tx: 150, ty: 8 },
          { type: 'baklava', tx: 205, ty: 11 },
          { type: 'ayran', tx: 258, ty: 13 }
        ],
        platforms: [
          [112 * TILE, 13 * TILE, 48, 8, 'x', 112 * TILE, 114.5 * TILE, 0.7],
          [217 * TILE, 13 * TILE, 64, 8, 'x', 217 * TILE, 220 * TILE, 0.6],
          [240.5 * TILE, 13 * TILE, 64, 8, 'y', 11 * TILE, 14 * TILE, 0.45],
          [262 * TILE, 13 * TILE, 48, 8, 'x', 262 * TILE, 263.5 * TILE, 0.8]
        ]
      };
    },

    /* New York — midnight avenue. Rooftop lane over the el-train, fire
     * escapes at mid height, and a cramped street full of gaps. */
    nyc: function () {
      var coins = [], blocks = [];
      /* A — stoops and rooftops */
      blocks.push([5, 11, 1, 1, 'brick'], [6, 11, 1, 1, 'q'], [7, 11, 1, 1, 'brick'], [8, 11, 1, 1, 'p']);
      blocks.push([14, 12, 2, 3], [16, 9, 8, 1]);          // roof 16..23
      /* B — tenements */
      blocks.push([33, 12, 2, 3], [35, 9, 9, 1]);          // roof 35..43
      blocks.push([45, 11, 2, 1]);
      /* C — plates under the el-train */
      blocks.push([56, 11, 2, 1], [58, 10, 2, 1]);
      /* D — midtown block */
      blocks.push([73, 12, 2, 3], [75, 9, 11, 1]);         // roof 75..85
      /* E — alley catwalks */
      blocks.push([94, 13, 3, 2], [97, 11, 4, 1], [102, 10, 4, 1]);
      /* F — the tower with two roofs */
      blocks.push([113, 12, 2, 3], [115, 9, 10, 1]);       // roof 115..124
      /* G — fire escapes */
      blocks.push([134, 11, 3, 1], [140, 10, 3, 1]);
      /* H — midpoint under the water tower */
      blocks.push([155, 12, 2, 3], [157, 9, 8, 1]);        // roof 157..164
      blocks.push([165, 11, 4, 1]);
      /* I — brownstone row */
      blocks.push([177, 12, 2, 3], [179, 9, 9, 1]);        // roof 179..187
      /* J — rooftop gap */
      blocks.push([197, 13, 3, 2], [201, 11, 4, 1], [206, 10, 3, 1]);
      /* K — the billboard run */
      blocks.push([218, 11, 4, 1], [223, 10, 4, 1]);
      /* L — last tenement */
      blocks.push([240, 12, 2, 3], [242, 9, 9, 1]);        // roof 242..250
      /* M — the spire */
      blocks.push([260, 13, 3, 2], [264, 11, 3, 1], [268, 10, 4, 1]);
      /* N — flag steps */
      blocks.push([282, 13, 2, 2], [284, 11, 2, 1], [286, 9, 2, 1]);

      row(coins, 5, 8, 13); row(coins, 10, 13, 10);
      row(coins, 16, 23, 8);
      row(coins, 31, 32, 13); row(coins, 35, 43, 8);
      row(coins, 56, 59, 9);
      row(coins, 71, 72, 13); row(coins, 75, 85, 8);
      row(coins, 89, 93, 13); row(coins, 97, 100, 10); row(coins, 102, 105, 9);
      row(coins, 115, 124, 8);
      row(coins, 134, 136, 10); row(coins, 140, 142, 9);
      row(coins, 152, 154, 13); row(coins, 157, 164, 8); row(coins, 165, 168, 10);
      row(coins, 179, 187, 8);
      row(coins, 197, 199, 12); row(coins, 201, 204, 10); row(coins, 206, 208, 9);
      row(coins, 218, 221, 10); row(coins, 223, 226, 9);
      row(coins, 242, 250, 8);
      row(coins, 260, 262, 12); row(coins, 264, 266, 10); row(coins, 268, 271, 9);
      row(coins, 284, 287, 8);

      return {
        grounds: [[0, 24], [30, 47], [52, 68], [70, 86], [92, 106], [112, 126],
                  [132, 147], [153, 167], [174, 189], [195, 209], [216, 230],
                  [237, 252], [258, 272], [280, 299]],
        blocks: blocks,
        coins: coins,
        enemies: [
          { type: 'walker', skin: 'hoodlum', tx: 12 },
          { type: 'walker', tx: 18, ty: 9 },
          { type: 'sheller', tx: 23 },
          { type: 'walker', skin: 'hoodlum', tx: 30 },
          { type: 'walker', tx: 40, ty: 9 },
          { type: 'walker', tx: 46 },
          { type: 'sheller', tx: 58 },
          { type: 'walker', skin: 'hoodlum', tx: 64 },
          { type: 'walker', tx: 79, ty: 9 },
          { type: 'walker', skin: 'hoodlum', tx: 84 },
          { type: 'sheller', tx: 97 },
          { type: 'walker', tx: 104 },
          { type: 'walker', skin: 'hoodlum', tx: 120, ty: 9 },
          { type: 'walker', tx: 133 },
          { type: 'walker', tx: 140, ty: 10 },
          { type: 'sheller', tx: 148 },
          { type: 'walker', skin: 'hoodlum', tx: 160, ty: 9 },
          { type: 'walker', tx: 168 },
          { type: 'walker', tx: 183, ty: 9 },
          { type: 'sheller', tx: 191 },
          { type: 'walker', skin: 'hoodlum', tx: 202, ty: 12 },
          { type: 'walker', tx: 209 },
          { type: 'walker', skin: 'hoodlum', tx: 219 },
          { type: 'sheller', tx: 226 },
          { type: 'walker', tx: 245, ty: 9 },
          { type: 'walker', skin: 'hoodlum', tx: 256 },
          { type: 'walker', tx: 270, ty: 10 },
          { type: 'walker', tx: 279 }
        ],
        foods: [
          { type: 'baklava', tx: 22, ty: 8 },
          { type: 'lahmacun', tx: 117, ty: 8 },
          { type: 'sujuk', tx: 141, ty: 9 },
          { type: 'baklava', tx: 184, ty: 8 },
          { type: 'ayran', tx: 251, ty: 13 }
        ],
        platforms: [
          [107 * TILE, 13 * TILE, 48, 8, 'x', 107 * TILE, 109 * TILE, 0.75],
          [168.5 * TILE, 13 * TILE, 64, 8, 'x', 168.5 * TILE, 172 * TILE, 0.6],
          [211 * TILE, 13 * TILE, 48, 8, 'y', 10 * TILE, 14 * TILE, 0.5],
          [232 * TILE, 13 * TILE, 48, 8, 'x', 232 * TILE, 235 * TILE, 0.7],
          [273 * TILE, 13 * TILE, 64, 8, 'x', 273 * TILE, 277 * TILE, 0.55]
        ]
      };
    },

    /* İstanbul — dusk over the strait. One enormous viaduct terrace runs
     * over the street for a third of the stage, so the whole middle has a
     * high road and a low road at the same time. Minarets crop up on both. */
    istanbul: function () {
      var coins = [], blocks = [];
      /* A — the foreshore */
      blocks.push([12, 11, 1, 1, 'brick'], [13, 11, 1, 1, 'q'], [14, 11, 1, 1, 'brick'], [15, 11, 1, 1, 'p']);
      blocks.push([22, 13, 2, 2]);
      /* B — the first minaret */
      blocks.push([36, 13, 3, 2], [40, 11, 2, 1], [42, 9, 2, 1]);
      /* C — plates under the el */
      blocks.push([56, 11, 2, 1], [58, 10, 2, 1]);
      /* D — a short viaduct before the gate */
      blocks.push([74, 12, 2, 3], [76, 9, 8, 1]);
      /* E — stairs up to the long terrace */
      blocks.push([95, 12, 2, 3]);
      blocks.push([99, 9, 38, 1]);                   // 99..136
      blocks.push([141, 9, 28, 1]);                  // 141..168
      blocks.push([173, 9, 24, 1]);                  // 173..196
      /* its supports, hanging from the deck into the street */
      blocks.push([110, 10, 1, 5], [126, 10, 1, 5], [150, 10, 1, 5], [184, 10, 1, 5]);
      /* F — midpoint: a terrace landing */
      /* G — second minaret and a bazaar */
      blocks.push([202, 13, 3, 2], [206, 11, 3, 1], [210, 9, 3, 1]);
      blocks.push([216, 11, 3, 1]);
      /* H — bazaar steps */
      blocks.push([224, 11, 4, 1], [229, 10, 4, 1], [234, 11, 3, 1]);
      /* I — ferry pier */
      blocks.push([246, 11, 3, 1], [252, 11, 4, 1], [257, 13, 2, 2]);
      /* J — the last dome */
      blocks.push([268, 13, 3, 2], [272, 11, 3, 1], [276, 9, 4, 1]);
      /* K — flag steps */
      blocks.push([283, 13, 2, 2], [285, 11, 2, 1], [287, 9, 2, 1]);

      row(coins, 5, 8, 13); row(coins, 12, 15, 10);
      row(coins, 22, 25, 12);
      row(coins, 36, 38, 12); row(coins, 42, 43, 8);
      row(coins, 56, 59, 9);
      row(coins, 74, 75, 10); row(coins, 76, 83, 8);
      row(coins, 99, 136, 8);
      row(coins, 141, 168, 8);
      row(coins, 173, 196, 8);
      row(coins, 158, 161, 11);
      row(coins, 202, 205, 12); row(coins, 210, 212, 8);
      row(coins, 216, 218, 10);
      row(coins, 224, 227, 10); row(coins, 229, 232, 9);
      row(coins, 246, 248, 10); row(coins, 252, 255, 10);
      row(coins, 268, 270, 12); row(coins, 276, 279, 8);
      row(coins, 285, 288, 8);

      return {
        grounds: [[0, 28], [33, 47], [53, 68], [70, 90], [95, 112], [117, 133],
                  [139, 154], [159, 175], [180, 196], [201, 217], [222, 238],
                  [243, 259], [265, 281], [284, 299]],
        blocks: blocks,
        coins: coins,
        enemies: [
          { type: 'walker', skin: 'uncle', tx: 14 },
          { type: 'walker', tx: 20 },
          { type: 'sheller', tx: 26 },
          { type: 'walker', skin: 'uncle', tx: 38, ty: 13 },
          { type: 'walker', tx: 45 },
          { type: 'walker', skin: 'uncle', tx: 58 },
          { type: 'sheller', tx: 66 },
          { type: 'walker', tx: 80, ty: 9 },
          { type: 'walker', skin: 'uncle', tx: 102, ty: 9 },
          { type: 'walker', tx: 110, ty: 9 },
          { type: 'sheller', tx: 118 },
          { type: 'walker', skin: 'uncle', tx: 128, ty: 9 },
          { type: 'walker', tx: 133, ty: 9 },
          { type: 'walker', skin: 'uncle', tx: 148, ty: 9 },
          { type: 'walker', tx: 152 },
          { type: 'walker', tx: 162, ty: 9 },
          { type: 'sheller', tx: 176, ty: 9 },
          { type: 'walker', skin: 'uncle', tx: 188, ty: 9 },
          { type: 'walker', tx: 194 },
          { type: 'walker', skin: 'uncle', tx: 208, ty: 9 },
          { type: 'walker', tx: 214 },
          { type: 'sheller', tx: 226, ty: 12 },
          { type: 'walker', skin: 'uncle', tx: 236 },
          { type: 'walker', tx: 250, ty: 11 },
          { type: 'walker', skin: 'uncle', tx: 262 },
          { type: 'walker', tx: 274, ty: 9 },
          { type: 'walker', tx: 282 }
        ],
        foods: [
          { type: 'baklava', tx: 64, ty: 12 },
          { type: 'lahmacun', tx: 160, ty: 11 },
          { type: 'sujuk', tx: 145, ty: 8 },
          { type: 'baklava', tx: 230, ty: 9 },
          { type: 'ayran', tx: 256, ty: 13 }
        ],
        platforms: [
          [50 * TILE, 13 * TILE, 48, 8, 'x', 50 * TILE, 51 * TILE, 0.65],
          [113 * TILE, 13 * TILE, 48, 8, 'x', 113 * TILE, 116 * TILE, 0.7],
          [137 * TILE, 13 * TILE, 32, 8, 'y', 11 * TILE, 14 * TILE, 0.45],
          [197 * TILE, 13 * TILE, 48, 8, 'x', 197 * TILE, 198 * TILE, 0.7],
          [261 * TILE, 13 * TILE, 64, 8, 'x', 261 * TILE, 264 * TILE, 0.6]
        ]
      };
    },

    /* Tampa — sunny palms. Low dunes, a long plank pier over the water and
     * a slow ferry. Grumpy retirees walk the beach and the pier. */
    tampa: function () {
      var coins = [], blocks = [];
      /* A — the dunes */
      blocks.push([12, 11, 1, 1, 'brick'], [13, 11, 1, 1, 'q'], [14, 11, 1, 1, 'brick'], [15, 11, 1, 1, 'p']);
      blocks.push([22, 13, 3, 2]);
      /* B — the boardwalk starts */
      blocks.push([36, 12, 2, 3], [38, 9, 6, 1]);
      /* C — plates on the sand */
      blocks.push([56, 11, 2, 1], [58, 10, 2, 1]);
      /* D — pier planks */
      blocks.push([74, 12, 2, 3], [76, 9, 11, 1]);
      /* E — the long pier with two gaps */
      blocks.push([96, 13, 3, 2], [100, 10, 4, 1], [104, 9, 8, 1], [115, 9, 10, 1], [128, 9, 6, 1]);
      blocks.push([100, 10, 1, 5], [111, 10, 1, 5], [124, 10, 1, 5], [133, 10, 1, 5]);
      /* F — dune ridge */
      blocks.push([140, 11, 4, 1], [146, 10, 4, 1], [150, 13, 2, 2]);
      /* G — midpoint under the palms */
      blocks.push([158, 13, 2, 2], [162, 11, 4, 1], [166, 10, 3, 1]);
      /* H — the ferry dock */
      blocks.push([178, 13, 3, 2], [182, 11, 3, 1], [187, 11, 2, 1]);
      /* I — boardwalk arcade */
      blocks.push([202, 13, 3, 2], [206, 11, 3, 1], [210, 9, 4, 1], [214, 12, 1, 3]);
      /* J — palm decks */
      blocks.push([224, 11, 4, 1], [229, 10, 4, 1], [234, 11, 3, 1]);
      /* K — last pier */
      blocks.push([246, 11, 3, 1], [252, 11, 4, 1], [257, 13, 2, 2]);
      /* L — the lighthouse */
      blocks.push([268, 13, 3, 2], [272, 11, 3, 1], [276, 9, 4, 1]);
      /* M — flag steps */
      blocks.push([283, 13, 2, 2], [285, 11, 2, 1], [287, 9, 2, 1]);

      row(coins, 5, 8, 13); row(coins, 12, 15, 10);
      row(coins, 22, 24, 12); row(coins, 38, 43, 8);
      row(coins, 56, 59, 9);
      row(coins, 74, 75, 10); row(coins, 76, 86, 8);
      row(coins, 100, 103, 9); row(coins, 104, 111, 8); row(coins, 115, 124, 8); row(coins, 128, 133, 8);
      row(coins, 140, 143, 10); row(coins, 146, 149, 9);
      row(coins, 158, 160, 12); row(coins, 162, 165, 10);
      row(coins, 178, 180, 12); row(coins, 182, 184, 10);
      row(coins, 210, 213, 8);
      row(coins, 224, 227, 10); row(coins, 229, 232, 9);
      row(coins, 246, 248, 10); row(coins, 252, 255, 10);
      row(coins, 276, 279, 8);
      row(coins, 285, 288, 8);

      return {
        grounds: [[0, 30], [35, 50], [55, 70], [70, 92], [97, 114], [119, 135],
                  [140, 156], [161, 177], [182, 198], [203, 219], [224, 240],
                  [245, 261], [266, 282], [285, 299]],
        blocks: blocks,
        coins: coins,
        enemies: [
          { type: 'walker', skin: 'grump', tx: 14 },
          { type: 'walker', tx: 20 },
          { type: 'sheller', tx: 28 },
          { type: 'walker', skin: 'grump', tx: 40, ty: 9 },
          { type: 'walker', tx: 46 },
          { type: 'walker', skin: 'grump', tx: 58 },
          { type: 'sheller', tx: 66 },
          { type: 'walker', tx: 82, ty: 9 },
          { type: 'walker', skin: 'grump', tx: 106, ty: 9 },
          { type: 'walker', tx: 120, ty: 9 },
          { type: 'sheller', tx: 131, ty: 9 },
          { type: 'walker', skin: 'grump', tx: 143, ty: 12 },
          { type: 'walker', tx: 152 },
          { type: 'walker', skin: 'grump', tx: 168, ty: 10 },
          { type: 'sheller', tx: 175 },
          { type: 'walker', skin: 'grump', tx: 190 },
          { type: 'walker', tx: 196 },
          { type: 'walker', skin: 'grump', tx: 212, ty: 9 },
          { type: 'walker', tx: 220 },
          { type: 'sheller', tx: 231, ty: 10 },
          { type: 'walker', skin: 'grump', tx: 238 },
          { type: 'walker', tx: 254, ty: 11 },
          { type: 'walker', skin: 'grump', tx: 264 },
          { type: 'walker', tx: 274, ty: 9 },
          { type: 'walker', tx: 281 }
        ],
        foods: [
          { type: 'baklava', tx: 64, ty: 12 },
          { type: 'lahmacun', tx: 187, ty: 10 },
          { type: 'sujuk', tx: 145, ty: 9 },
          { type: 'baklava', tx: 230, ty: 9 },
          { type: 'ayran', tx: 256, ty: 13 }
        ],
        platforms: [
          [51 * TILE, 13 * TILE, 48, 8, 'x', 51 * TILE, 54 * TILE, 0.7],
          [220 * TILE, 13 * TILE, 48, 8, 'x', 220 * TILE, 221 * TILE, 0.65],
          [137 * TILE, 13 * TILE, 48, 8, 'x', 137 * TILE, 138 * TILE, 0.7],
          [242 * TILE, 13 * TILE, 48, 8, 'x', 242 * TILE, 245 * TILE, 0.6]
        ]
      };
    }
  };

  /* ------------------------------------------------------------------ */
  /* Level construction                                                  */
  /* ------------------------------------------------------------------ */
  /* A food is a 14px pickup with a little air around it. Hand placement is
   * easy to get subtly wrong — two snacks in the same pocket read as one
   * stubborn item, and one hovering over a critter's head looks like a hat.
   * Nudge a colliding food to the nearest clear tile instead of shipping the
   * overlap; the types of the stage never change, only where one sits. */
  function resolveFoods(list, g, enemies) {
    var F = 14, PAD = 8;
    function free(x, y, placed) {
      if (x < TILE || y < TILE) return false;
      if (x + F > (LEVEL_W - 1) * TILE || y + F > (LEVEL_H - 2) * TILE) return false;
      var x0 = Math.floor(x / TILE), x1 = Math.floor((x + F - 1) / TILE);
      var y0 = Math.floor(y / TILE), y1 = Math.floor((y + F - 1) / TILE);
      for (var ty = y0; ty <= y1; ty++) {
        for (var tx = x0; tx <= x1; tx++) {
          if (g[ty * LEVEL_W + tx]) return false;   // never buried in terrain
        }
      }
      for (var i = 0; i < placed.length; i++) {
        var p = placed[i];
        if (Math.abs(p.x - x) < F + PAD && Math.abs(p.y - y) < F + PAD) return false;
      }
      for (var e = 0; e < enemies.length; e++) {
        var en = enemies[e];
        if (x < en.x + en.w + PAD && x + F + PAD > en.x &&
            y < en.y + en.h + PAD && y + F + PAD > en.y) return false;
      }
      return true;
    }
    /* prefer straight up: a snack one tile higher still reads as floating on
     * that spot, while a sideways nudge can land it over a pit */
    var offsets = [[0, 0], [0, -1], [0, -2], [2, 0], [-2, 0], [3, 0], [-3, 0],
      [0, -3], [4, 0], [-4, 0], [0, 1], [0, -4], [5, 0], [-5, 0]];
    var placed = [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i], ok = false;
      for (var k = 0; k < offsets.length; k++) {
        var nx = f.x + offsets[k][0] * TILE;
        var ny = f.y + offsets[k][1] * TILE;
        if (!free(nx, ny, placed)) continue;
        f.x = nx; f.y = ny; ok = true; break;
      }
      /* if nothing fits, leave it alone rather than drop a pickup */
      if (ok) placed.push(f);
    }
    return list;
  }

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
    rect(GATE_TX, 9, 1, 6, T.GATE);
    rect(GOAL_TX, 9, LEVEL_W - GOAL_TX, 9, T.SOLID);
    var coins = plan.coins.map(function (c) {
      return { x: c[0] * TILE + 3, y: c[1] * TILE + 3, taken: false };
    });
    /* Critters are people-sized now: a themed pedestrian stands 20px, the
     * plain walker and the sheller 18px, against the buddies' 22px. */
    var enemies = plan.enemies.map(function (e, qi) {
      var h = e.type === 'walker' && !e.skin ? 18 : e.skin ? 20 : 18;
      return {
        type: e.type, skin: e.skin || '',
        x: e.tx * TILE + 1, y: (e.ty != null ? e.ty : 13) * TILE,
        w: 13, h: h, baseH: h,
        vx: -0.45, vy: 0, dir: -1, state: 'walk', timer: 0, dead: false, onGround: false,
        /* the quirk clock starts staggered, or every hoodlum in the city
         * would sprint on the same tick */
        mode: 'walk', q: (qi * 53) % 300, rest: 0, fleeCd: 0
      };
    });
    /* A handful of authored spawns ended up over a pit when a roof was
     * shortened under them in a layout pass. Those critters dropped out of
     * the level within a second, so a seventh of the cast was gone before
     * the player ever arrived. Snap any such spawn to the nearest column
     * that actually has a floor, keeping it as close to where it was
     * authored as the terrain allows. */
    function floorRow(tx, fromY) {
      for (var ty = Math.floor(fromY / TILE); ty < LEVEL_H; ty++) {
        if (g[ty * LEVEL_W + tx] !== T.EMPTY) return ty;
      }
      return -1;
    }
    enemies.forEach(function (e) {
      var tx = Math.floor((e.x + e.w / 2) / TILE);
      if (floorRow(tx, e.y + e.h) >= 0) return;
      var bestTx = -1, bestRow = -1;
      for (var d = 1; d <= 24 && bestTx < 0; d++) {
        var cands = [tx - d, tx + d];
        for (var ci = 0; ci < cands.length && bestTx < 0; ci++) {
          var cx = cands[ci];
          if (cx < 1 || cx >= LEVEL_W) continue;
          var row = floorRow(cx, e.y + e.h);
          if (row < 0) continue;
          var clear = true;
          for (var r = row - Math.ceil(e.h / TILE); r < row; r++) {
            if (r < 0 || g[r * LEVEL_W + cx] !== T.EMPTY) { clear = false; break; }
          }
          if (!clear) continue;
          bestTx = cx; bestRow = row;
        }
      }
      if (bestTx < 0) return;                 // no floor anywhere near: leave it
      e.x = bestTx * TILE + 1;
      e.y = bestRow * TILE - e.h;
    });

    return {
      w: LEVEL_W, h: LEVEL_H, tiles: g, stage: pick,
      coins: coins, enemies: enemies,
      /* authored positions; createGame() runs resolveFoods() after the
       * critters settle, so the shipped game never shows two in one pocket */
      foods: (plan.foods || []).map(function (f) {
        return { type: f.type, x: f.tx * TILE + 1, y: f.ty * TILE, w: 14, h: 14, taken: false };
      }),
      switches: [
        { tx: 63, ty: 14, pressed: false },
        { tx: 66, ty: 14, pressed: false }
      ],
      gateTx: GATE_TX,
      platforms: plan.platforms.map(function (p) {
        return {
          x: p[0], y: p[1], w: p[2], h: p[3], axis: p[4], min: p[5], max: p[6],
          speed: p[7], dir: 1, dx: 0, dy: 0
        };
      }),
      midpointTx: MID_TX, goalTx: GOAL_TX, goalTopTy: 9
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
      hp: MAX_HEARTS, maxHp: MAX_HEARTS, big: false, star: 0,
      state: 'play', invuln: 0, stateT: 0, squash: 0,
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
      foods: level.foods, berries: [], coinCount: 0, score: 0,
      lives: 3, gameOver: false, respawnAt: 0,
      timeLeft: 300 * 60, finished: false, finishTick: 0,
      runTicks: 0,
      camX: 0, events: [], tileDiff: {},
      rng: 12345
    };
    /* settle authored spawns once so tick 0 is already clear of terrain */
    for (var ei = 0; ei < st.enemies.length; ei++) unbury(st, st.enemies[ei]);
    /* ...and only then keep the snacks apart: unbury() can lift a critter onto
     * the very tile a food was authored above, which is exactly the overlap
     * the player sees on screen. Resolving last means it is never possible. */
    resolveFoods(st.foods, st.tiles, st.enemies);
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
    p.big = false; p.hp = MAX_HEARTS; p.star = 0; p.stuck = 0; p.onPartner = false; p.onPlatform = null;
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
      p.hp = MAX_HEARTS; p.big = false; p.star = 0;
      p.onPartner = false; p.onPlatform = null; p.stuck = 0;
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
      p.state = 'play'; p.hp = MAX_HEARTS; p.big = false; p.star = 0; p.invuln = 140;
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
    if (p.state !== 'play' || p.invuln > 0 || p.star > 0) return;
    if (p.hp > 1) {
      p.hp--; p.invuln = 130;
      p.vx = (p.x + p.w / 2 < fromX ? -1.6 : 1.6); p.vy = -3.4;
      ev(st, 'hurt');
    } else {
      downPlayer(st, p);
    }
  }

  /* One-way deck collision for the moving platforms. Landings are swept
   * from the feet position before this step, so a fast fall cannot tunnel
   * through a deck, and a deck that rises into a buddy lifts them instead
   * of passing through them. */
  function landOnPlatforms(st, p, beforeBottom) {
    if (p.absent || p.state !== 'play') return;
    for (var i = 0; i < st.platforms.length; i++) {
      var pl = st.platforms[i];
      if (p.x + p.w <= pl.x + 2 || p.x >= pl.x + pl.w - 2) continue;
      var feet = p.y + p.h;
      if (pl.dy < 0 && feet > pl.y && feet < pl.y + 18 && p.vy >= -0.01) {
        p.y = pl.y - p.h; p.vy = 0; p.onGround = true; p.onPlatform = pl;
        continue;
      }
      var drop = Math.max(24, Math.abs(p.vy) + 6);
      if (p.vy >= 0 && beforeBottom <= pl.y + 4 && feet >= pl.y && feet <= pl.y + drop) {
        p.y = pl.y - p.h; p.vy = 0; p.onGround = true; p.onPlatform = pl;
      }
    }
  }

  function stepPlayer(st, p, input, partner) {
    if (p.absent || p.state === 'absent' || p.state === 'ko') return;
    p.animT++;
    if (p.invuln > 0) p.invuln--;
    if (p.squash > 0) p.squash--;
    if (p.star > 0) p.star--;

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
            p.state = 'play'; p.carry = false; p.invuln = 140; p.hp = MAX_HEARTS; p.vx = 0; p.vy = 0;
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
        p.state = 'play'; p.carry = false; p.invuln = 130; p.hp = MAX_HEARTS; p.vy = 0; p.vx = 0;
        safePlace(st, p, partner.x, partner.y - p.h - 1);
        ev(st, 'pop');
      } else if ((!partner || partner.absent || partner.state !== 'play') && p.stateT > 420) {
        // nobody left to rescue them: back to the checkpoint
        p.state = 'play'; p.invuln = 130; p.hp = MAX_HEARTS;
        safePlace(st, p, st.checkpoint.x, st.checkpoint.y);
        p.bubbleX = p.bubbleY = null;
        ev(st, 'pop');
      }
      return;
    }
    p.bubbleX = p.bubbleY = null;

    /* --- platform carry --- */
    if (p.onPlatform) {
      /* A deck slides its rider along, but it must never push them into a
       * wall: burying the body there used to trip the anti-burial rescue, */
      /* which popped the buddy up through the bricks. */
      var carriedX = p.x + p.onPlatform.dx;
      if (!blockedBox(st, carriedX, p.y + p.onPlatform.dy, p.w, p.h)) {
        p.x = carriedX; p.y += p.onPlatform.dy;
      }
    }
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
    var beforeBottom = p.y + p.h;
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

    /* --- moving platforms: land on the deck --- */
    landOnPlatforms(st, p, beforeBottom);

    /* --- pit fall --- */
    if (p.y > st.levelH * TILE + 24) { downPlayer(st, p); return; }

    /* --- coins --- */
    for (var ci = 0; ci < st.coinsArr.length; ci++) {
      var c = st.coinsArr[ci];
      if (!c.taken && overlap(p, { x: c.x, y: c.y, w: 10, h: 10 })) {
        c.taken = true; st.coinCount++; st.score += 50; ev(st, 'coin');
      }
    }
    /* --- berries (growth + one star) --- */
    for (var bi = st.berries.length - 1; bi >= 0; bi--) {
      var b = st.berries[bi];
      if (overlap(p, b)) {
        p.big = true; p.hp = Math.min(MAX_HEARTS, p.hp + 1);
        st.score += 500; ev(st, 'power');
        st.berries.splice(bi, 1);
      }
    }
    /* --- voxel food --- */
    for (var fi = 0; fi < st.foods.length; fi++) {
      var f = st.foods[fi];
      if (f.taken) continue;
      if (!overlap(p, { x: f.x, y: f.y, w: 14, h: 14 })) continue;
      var def = FOODS[f.type] || FOODS.baklava;
      f.taken = true;
      st.score += def.score;
      if (def.heal) p.hp = Math.min(MAX_HEARTS, p.hp + def.heal);
      if (def.life) st.lives = Math.min(99, st.lives + def.life);
      if (def.star) { p.star = def.star; p.invuln = Math.max(p.invuln, 2); }
      if (f.type === 'lahmacun') p.big = true;
      ev(st, 'food');
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
  /* Each city's people walk to their own rhythm. The quirks are data, not
   * special cases buried in the step loop: the guide describes them, the
   * headless tests measure them, and every speed here stays under a
   * *walking* buddy (1.7 px/tick), so no pedestrian can ever outrun a
   * player who is not running. */
  var QUIRKS = {
    /* İzmir: the seller stops every few steps to hand over a cone, which
     * is the opening a new player needs on the first stage. */
    icecream: { restEvery: 300, restFor: 72 },
    /* New York: a short sprint, telegraphed by a forward lean, then back to
     * a stroll — fast enough to worry you, slow enough to react to. */
    hoodlum: { dashEvery: 260, dashFor: 52, dashSpd: 1.5 },
    /* İstanbul: he never leaves a ledge in a hurry — every turn is a sip. */
    uncle: { restOnTurn: 46 },
    /* Tampa: shuffles, and turns away when a buddy gets in his face. The
     * cooldown stops him ping-ponging when you dance around him. */
    grump: { spd: 0.34, bolt: 42, boltCd: 96 }
  };

  /* True when a live buddy is standing within `reach` px on the side this
   * critter is facing, at roughly the same height. */
  function facingBuddy(st, e, reach) {
    var cx = e.x + e.w / 2, cy = e.y + e.h;
    for (var i = 0; i < st.players.length; i++) {
      var p = st.players[i];
      if (p.absent || p.state !== 'play') continue;
      var ahead = (p.x + p.w / 2 - cx) * e.dir;
      if (ahead > 0 && ahead < reach && Math.abs((p.y + p.h) - cy) < 26) return true;
    }
    return false;
  }

  function stepEnemy(st, e) {
    if (e.dead) return;
    unbury(st, e);
    if (e.state === 'shell') {
      e.timer++;
      e.vx = 0;
      e.vy += 0.4; if (e.vy > 7) e.vy = 7;
      moveCollide(st, e, false);
      if (e.timer > 480) {
        e.state = 'walk'; e.h = e.baseH || (e.skin ? 20 : 18); e.y -= (e.h - 12);
      }
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
    // walking, with whatever rhythm this city's people keep
    e.vy += 0.4; if (e.vy > 7) e.vy = 7;
    var quirk = QUIRKS[e.skin];
    var spd = e.type === 'walker' ? 0.45 : 0.4;
    var mode = 'walk';
    if (quirk) {
      e.q = (e.q || 0) + 1;
      if (quirk.spd != null) spd = quirk.spd;
      if (e.rest > 0) e.rest--;
      else if (quirk.restEvery && e.q % quirk.restEvery === 0) e.rest = quirk.restFor;
      if (e.rest > 0) {
        spd = 0; mode = 'rest';
      } else if (quirk.dashEvery) {
        if (e.q % quirk.dashEvery < quirk.dashFor) { spd = quirk.dashSpd; mode = 'dash'; }
      } else if (quirk.bolt) {
        if (e.fleeCd > 0) e.fleeCd--;
        else if (facingBuddy(st, e, quirk.bolt)) {
          e.dir = -e.dir; e.fleeCd = quirk.boltCd; mode = 'bolt';
        }
      }
    }
    e.mode = mode;
    e.vx = e.dir * spd;
    moveCollide(st, e, false);
    if (e.hitWall) { e.dir = -e.dir; e.hitWall = 0; if (quirk && quirk.restOnTurn) e.rest = quirk.restOnTurn; }
    if (e.onGround) {
      var aheadX = e.dir > 0 ? Math.floor((e.x + e.w + 2) / TILE) : Math.floor((e.x - 2) / TILE);
      var belowY = Math.floor((e.y + e.h + 2) / TILE);
      if (!solidAt(st, aheadX, belowY)) {   // turn at ledges
        e.dir = -e.dir;
        if (quirk && quirk.restOnTurn) e.rest = quirk.restOnTurn;
      }
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
        /* sujuk: touch anything and it is out, no stomp needed */
        if (p.star > 0) {
          e.dead = true; st.score += 200; ev(st, 'starhit');
          continue;
        }
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
          else {
            e.state = 'shell'; e.timer = 0;
            e.y += e.h - 12; e.h = 12;                 // bottom stays put
          }
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
                p.big ? 1 : 0, p.state, p.invuln > 0 ? 1 : 0, p.squash > 0 ? 1 : 0, p.absent ? 1 : 0, p.skid ? 1 : 0,
                p.hp, p.star > 0 ? 1 : 0];
      }),
      star: st.players.map(function (p) { return p.star > 0 ? 1 : 0; }),
      foodsTaken: st.foods.map(function (f) { return f.taken ? '1' : '0'; }).join(''),
      enemies: st.enemies.map(function (e) {
        return [round1(e.x), round1(e.y), e.state, e.dir, e.dead ? 1 : 0, e.mode || 'walk'];
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
      if (typeof a[11] === 'number') p.hp = a[11];
      if (typeof a[12] === 'number') p.star = a[12] ? 60 : 0;
    });
    s.enemies.forEach(function (a, i) {
      var e = st.enemies[i]; if (!e) return;
      e.x = a[0]; e.y = a[1]; e.state = a[2]; e.dir = a[3]; e.dead = !!a[4];
      /* the quirk pose is host-authoritative too, or a sprinting hoodlum
       * would stroll on the guest's screen */
      if (a[5]) e.mode = a[5];
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
    if (typeof s.foodsTaken === 'string') {
      for (var fi = 0; fi < st.foods.length; fi++) {
        st.foods[fi].taken = s.foodsTaken.charAt(fi) === '1';
      }
    }
    st.tiles.set(st.baseTiles);
    st.tileDiff = {};
    for (var k in s.tileDiff) { st.tiles[k] = s.tileDiff[k]; st.tileDiff[k] = s.tileDiff[k]; }
    if (s.mid) st.checkpoint = { x: st.midpointTx * TILE, y: 13 * TILE };
  }

  var Engine = {
    TILE: TILE, VIEW_W: VIEW_W, VIEW_H: VIEW_H, T: T, QUIRKS: QUIRKS,
    createGame: createGame, step: stepMapped, makeSnapshot: makeSnapshot,
    applySnapshot: applySnapshot, buildLevel: buildLevel,
    EMPTY_INPUT: EMPTY_INPUT
  };
  global.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
