// R2.0.18 — présentation : tunnels, menu, entrées, audio, vies (spike 03, D-23 … D-30)
// Le plateau se dessine en cinq passes de priorité (découpes, éclats, billes) sans omettre aucune bille ; le menu en
// jeu est le dialogue OPTIONS composé sur canvas ; la visée et le tir couvrent toute la fenêtre ; « Pixels nets »
// tombe sur un nombre entier de pixels d'appareil ; roulement adouci, panoramique des pièces, triple « extralife ».
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { drawPasses } from '../.compiled/render.js';

const read = file => fs.readFileSync(file, 'utf8');
/** Body of a compiled method / function from its signature up to the next line starting at the same indent with `}`. */
const body = (src, signature) => {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} compiled`);
  const indent = src.slice(src.lastIndexOf('\n', start) + 1, start).match(/^\s*/)[0];
  const end = src.indexOf(`\n${indent}}`, start);
  return src.slice(start, end > 0 ? end : undefined);
};
/** Body of a `case '<kind>'` block of the compiled handleEvents, up to the next `case '`. */
const caseBlock = (src, kind) => {
  const start = src.indexOf(`case '${kind}'`);
  assert.ok(start > 0, `case '${kind}' compiled`);
  const end = src.indexOf("case '", start + 8);
  return src.slice(start, end > 0 ? end : undefined);
};

// ---------------------------------------------------------------- tunnels : passes de priorité (0x40c470, D-23)

test('drawPasses: five passes L = 0..4, cutouts of priority L then balls of priority L; priorities bounded 0..4', () => {
  const passes = drawPasses(
    [{ priority: 0, id: 'a' }, { priority: 1, id: 'b' }, { priority: 0, id: 'c' }, { priority: 2, id: 'd' }],
    [{ priority: 1, id: 'L' }, { priority: 1, id: 'R' }],
  );
  assert.equal(passes.length, 5);
  assert.deepEqual(passes.map(p => p.layer), [0, 1, 2, 3, 4]);
  assert.deepEqual(passes.flatMap(p => [...p.cutouts, ...p.balls]).map(x => x.id), ['a', 'c', 'L', 'R', 'b', 'd']);
  const odd = drawPasses([{ priority: -3, id: 'neg' }, { priority: NaN, id: 'nan' }, { priority: 9, id: 'big' }, { priority: 2.7, id: 'frac' }], [{ priority: Infinity, id: 'inf' }]);
  assert.deepEqual(odd[0].balls.map(b => b.id), ['neg', 'nan'], 'negative / NaN → 0');
  assert.deepEqual(odd[4].balls.map(b => b.id), ['big'], '> 4 → 4');
  assert.deepEqual(odd[2].balls.map(b => b.id), ['frac'], 'fractions truncated');
  assert.deepEqual(odd[0].cutouts.map(c => c.id), ['inf'], 'non-finite → 0 (T-05-28)');
  const empty = drawPasses([], []);
  assert.equal(empty.length, 5);
  assert.ok(empty.every(p => p.balls.length === 0 && p.cutouts.length === 0));
});

test('render.js: every ball is drawn in its priority pass (ballPriority), cutouts inside the passes, nothing skipped by a layer bit', () => {
  const render = read('.compiled/render.js');
  assert.match(render, /export function drawPasses\(/);
  assert.match(render, /ballPriority\(/, 'balls classified by Track.ballPriority');
  assert.doesNotMatch(render, /layerAt\(ball\.s\) & 2/, 'no ball skipped as « hidden »');
  assert.doesNotMatch(render, /layerAt\([^)]*\) & 1\) - /, 'no « tunnel on top » sort');
  const draw = body(render, '    draw(engine, fx, hud, frame) {');
  assert.match(draw, /drawPasses\(/);
  assert.ok(draw.indexOf('this.drawCutouts(') >= 0, 'cutouts drawn from draw()');
  assert.ok(draw.indexOf('this.drawCutouts(') < draw.indexOf('this.drawProjectiles('), 'cutouts no longer drawn after the projectiles');
  assert.ok(draw.indexOf('this.drawProjectiles(') < draw.indexOf('this.drawFrog('), 'projectiles, then the frog');
  const board = body(render, '    paintProceduralBoard(view) {');
  assert.match(board, /track\.layers\[i\] & 1/, 'vector board: tunnel sections from bit 0');
});

test('original.js: levelArt carries each cutout priority (pack `priority`, default 1, bounded 0..4) into DrawableLayer', () => {
  const original = read('.compiled/original.js');
  const art = body(original, '    async levelArt(g) {');
  assert.match(art, /c\.priority/);
  assert.match(art, /priority/);
  assert.match(original, /function layerPriority\(/);
});

test('main.js: bursts and tally sparkles get the layer of their chain (ballPriority), the sparkle seed depends on the chain', () => {
  const main = read('.compiled/main.js');
  const destroy = caseBlock(main, 'destroy');
  assert.match(destroy, /makeColorBurst\(/);
  assert.match(destroy, /ballPriority\(/);
  assert.match(destroy, /layer/);
  const cleanup = caseBlock(main, 'cleanup');
  assert.match(cleanup, /e\.chain/);
  assert.match(cleanup, /ballPriority\(/);
  assert.match(cleanup, /makeSparks\([^;]*\* 4 \+ chain/, 'seed = step × 4 + chain');
});
