import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * R2.0.22 — affichage des records partagés avec les graphismes du jeu (06.1-CONTEXT D-09, D-01): the best time with
 * its holder's first name and the personal best in the original STATS grid (sixth row of the right column, aligned on
 * COMBO MAX.), the « TOUS » / « MOI » scope on the RECORDS plaque of the adventure and ending screens, and the pure
 * hit tests of both plaques. Without records data every screen draws exactly the call sequence of R2.0.21: the
 * reference digests below were captured on the R2.0.21 sources before any change (plan 06.1-04).
 * R2.0.28: records personnels (demande utilisateur) — the holder, « MOI » row and scope displays are gone; only the
 * R2.0.21 call-sequence locks and the no-DOM locks remain here (personal display locked in r228-personal-records).
 */
const S = () => import('../.compiled/statsdialog.js');
const read = file => fs.readFileSync(file, 'utf8');

/** Canvas 2D stand-in that records every call and property write (Node has no canvas), as in r221-adventure. */
function recorder() {
  const calls = [];
  const state = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1, imageSmoothingEnabled: true };
  const stack = [];
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'calls') return calls;
      if (prop in state) return state[prop];
      if (prop === 'save') return () => { stack.push({ ...state }); calls.push({ op: 'save' }); };
      if (prop === 'restore') return () => { Object.assign(state, stack.pop() ?? {}); calls.push({ op: 'restore' }); };
      if (prop === 'measureText') return s => ({ width: String(s).length * 8 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push({ op: prop, args, alpha: state.globalAlpha, fill: state.fillStyle }); };
    },
    set(_t, prop, value) {
      state[prop] = value;
      calls.push({ op: 'set', prop, value });
      return true;
    },
  });
}

/** SHA-256 of a recorded call sequence (the R2.0.21 references are kept as digests). */
const digest = calls => crypto.createHash('sha256').update(JSON.stringify(calls)).digest('hex');

/** Width of the STATS text font measured on the R2.0.20 capture (≈ 9.6 px per capital). */
const PER_CHAR = 9.6;
const m = s => PER_CHAR * [...String(s)].length;

const pic = (name, width, height) => ({ name, width, height });
/** A bitmap font stand-in that records its draws into the context's call list. */
const fakeFont = (name, perChar = PER_CHAR, cap = 11) => ({
  name, pixelScale: 1, ascent: 14, height: 17, capHeight: cap,
  measure: s => perChar * [...String(s)].length,
  draw(ctx, text, x, y, options = {}) { ctx.calls.push({ op: 'font', font: name, text, x, y, options }); return perChar * [...String(text)].length; },
});

// ---------------------------------------------------------------- STATS (Task 1)

const statsKit = () => ({
  frame: pic('dialogbox', 243, 242), head: pic('godhead', 156, 140), button: pic('dialogbutton', 360, 48),
  fonts: { title: fakeFont('title', 12), text: fakeFont('text'), tip: fakeFont('tip', 7), tipSmall: fakeFont('small', 6) },
  strings: { TIP: 'ASTUCE', BEST_TIME: 'RECORD' }, pixelScale: 1,
});
const statsValuesFixture = { points: '12340', combos: '3', coins: '1', gaps: '2', chain: '14', comboMax: '4', time: '1:23', objective: '1:40', bonus: '+1700', record: '1:23' };
const TIP = 'Tirez sur les pièces pour gagner des points en plus.';

function composeCalls(compose, options) {
  const ctx = recorder();
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  compose(statsKit(), statsValuesFixture, { button: 'normal', tip: TIP, ...options }, canvas, 1);
  return ctx.calls;
}

/** Call sequences of composeStatsDialog in R2.0.21 (no `record` option), revealed 10 and 9. */
const STATS_R221 = {
  revealed10: 'd9c23ac07d6a74c9cca87679be5a11f1a0a0d2f648674a10bf003a3d60b9c534',
  revealed9: '39f08e9be7e822d3ffeddf98d91fa176fc0add18d0bc6a02ba0eff594d2678a7',
};

test('composeStatsDialog: the R2.0.21 call sequence, unchanged (references captured before the change)', async () => {
  const { composeStatsDialog } = await S();
  assert.equal(digest(composeCalls(composeStatsDialog, { revealed: 10 })), STATS_R221.revealed10);
  assert.equal(digest(composeCalls(composeStatsDialog, { revealed: 9 })), STATS_R221.revealed9);
  // R2.0.28: records personnels (demande utilisateur) — the `record` option (holder, « MOI » row) is gone, see r228.
});

// R2.0.28: records personnels (demande utilisateur) — recordLabel, layoutRecordRow and the sixth STATS row tests removed
// (single RECORD line with the player's own best, locked in r228-personal-records).

test('source locks: no DOM text injection in the drawing modules', () => {
  // R2.0.28: records personnels (demande utilisateur) — no sixth-row layout nor holder label any more (r228).
  for (const file of ['src/statsdialog.ts', 'src/adventure.ts']) assert.doesNotMatch(read(file), /innerHTML|textContent|insertAdjacentHTML/, file);
});

// ---------------------------------------------------------------- RECORDS plaques (Task 2)

const A = () => import('../.compiled/adventure.js');
const advFont = name => fakeFont(name, 7, 8);
const DOOR_W = [62, 60, 57, 64, 57, 51, 45, 44, 56, 61, 64, 62];
const DOOR_H = [58, 90, 56, 57, 43, 35, 34, 38, 41, 50, 49, 49];
function fakeAdvKit(fonts = true) {
  const f = name => (fonts ? advFont(name) : null);
  return {
    sky: pic('advsky', 640, 116), back: pic('advback', 640, 250), title: pic('advtitle', 185, 73), plaque: pic('advhighscore', 184, 65), stage: pic('advstage', 76, 16),
    temples: {
      advtemple1: pic('advtemple1', 640, 292), advtemple2: pic('advtemple2', 228, 208), advtemple2v: pic('advtemple2v', 228, 208), advtemple3: pic('advtemple3', 245, 194),
      advtemple3v: pic('advtemple3v', 245, 194), advtemple4: pic('advtemple4', 291, 249), advmiddle: pic('advmiddle', 640, 185),
    },
    doors: DOOR_W.map((w, i) => pic(`door${i}`, w * 4, DOOR_H[i])),
    doorMasks: null,
    play: pic('play', 291, 39), mainMenu: pic('mainmenu', 375, 42), happyEnding: pic('happyending', 640, 480),
    fonts: { brown: f('brown'), message: f('message'), score: f('score'), number: f('number'), huge: f('huge'), title: f('title') },
    dialog: null, pixelScale: 1,
  };
}
// Demonstration names only.
const plaqueScores = [{ name: 'Zuma', score: 10000 }, { name: 'Grenouille', score: 5000 }, { name: 'Têtard', score: 1000 }];
const advView = { c: 8, maxStage: 4, selected: 4, hover: 3, button: { hover: 'play', pressed: null }, reveal: null, shake: [0, 0, 0, 0], scores: plaqueScores, strings: null };
const endingScores = Array.from({ length: 10 }, (_, i) => ({ name: `N${i}`, score: 90000 - i * 5000, stage: 12, level: 0, date: '' }));
const endingView = { score: 80000, rank: 2, scores: endingScores, hover: false, pressed: false, strings: { CONGRATULATIONS: 'FÉLICITATIONS !', SCORE: 'Score :' } };
function endingKit() {
  const kit = fakeAdvKit();
  kit.dialog = { frame: pic('dialogbox', 243, 242), head: null, button: pic('dialogbutton', 360, 48), fonts: { title: advFont('t'), text: advFont('x'), tip: null, tipSmall: null }, strings: {}, pixelScale: 1 };
  return kit;
}
const drawn = (draw, kit, view) => { const ctx = recorder(); draw(ctx, kit, view); return ctx.calls; };

/** Call sequences of drawAdventure / drawEnding in R2.0.21 (no scope): pack kit and vector stand-in. */
const SCREENS_R221 = {
  adventure: '7776c90274781d78162bcd9805feb66924b574a354b04ea74741077f879c9e74', adventureVector: '41e1745f2db7e5b7caa213f18076179d1c4a035836154ada4195f674637c4b29', ending: '3ddb86e84f807764512a51baa908ae4310df9664b2ebcb100f28e4df95888289', endingVector: '1690fa8a29249c68397cc5eda28e9d75eb6e178ff4f47547190026c2ae0e7187',
};

test('drawAdventure / drawEnding: the R2.0.21 call sequences, unchanged (references captured before the change)', async () => {
  const { drawAdventure, drawEnding } = await A();
  assert.equal(digest(drawn(drawAdventure, fakeAdvKit(), advView)), SCREENS_R221.adventure);
  assert.equal(digest(drawn(drawAdventure, null, advView)), SCREENS_R221.adventureVector);
  assert.equal(digest(drawn(drawEnding, endingKit(), endingView)), SCREENS_R221.ending);
  assert.equal(digest(drawn(drawEnding, null, endingView)), SCREENS_R221.endingVector);
  // R2.0.28: records personnels (demande utilisateur) — no scope any more (r228).
});

// R2.0.28: records personnels (demande utilisateur) — ADV_SCOPE, advPlaqueAt / endingPlaqueAt and the « TOUS » / « MOI » drawing tests removed
// (no scope label nor toggle on the RECORDS plaques, locked in r228-personal-records).

test('source locks: no DOM access in the drawing modules', () => {
  const src = read('src/adventure.ts');
  // R2.0.28: records personnels (demande utilisateur) — view.scope and the plaque hit tests removed (r228).
  assert.doesNotMatch(src, /document\.|window\./);
});
