// R2.0.20 — UAT 9 (quick 261011-ios-sound-menu) : « peut-on faire un appui long sur le bouton menu pour ouvrir le menu ? ».
// Un appui de 450 ms ou plus sur MENU (souris, toucher, stylet ; doigt resté dans le bouton, déplacé de moins de 12 px)
// ouvre le menu sans tirer ; relâché avant, le comportement d'avant reste (souris : le clic tire, D-26 ; toucher : le menu).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { longPress, LONG_PRESS_MS, LONG_PRESS_SLOP, LONG_PRESS_IDLE } from '../.compiled/render.js';
import { CONTROLS_HELP } from '../.compiled/menudialog.js';

const read = file => fs.readFileSync(file, 'utf8');
const down = (t = 1000, extra = {}) => ({ kind: 'down', id: 7, x: 100, y: 20, t, inside: true, ...extra });
/** Runs inputs from the idle state; returns the actions and the final state. */
function run(...inputs) {
  let state = LONG_PRESS_IDLE;
  const actions = [];
  for (const input of inputs) {
    const step = longPress(state, input);
    state = step.state;
    actions.push(step.action);
  }
  return { actions, state };
}

test('constants: 450 ms, 12 px; idle state', () => {
  assert.equal(LONG_PRESS_MS, 450);
  assert.equal(LONG_PRESS_SLOP, 12);
  assert.equal(LONG_PRESS_IDLE.phase, 'idle');
});

test('start: a press inside the button arms the hold; outside does nothing', () => {
  assert.deepEqual(run(down()).actions, ['start']);
  assert.equal(run(down()).state.phase, 'pending');
  const outside = run(down(1000, { inside: false }));
  assert.deepEqual(outside.actions, ['none']);
  assert.equal(outside.state.phase, 'idle');
});

test('timeout: the hold fires at 450 ms (not before), then the release is swallowed (no shot)', () => {
  const r = run(down(1000), { kind: 'tick', t: 1449 }, { kind: 'tick', t: 1450 }, { kind: 'tick', t: 1500 }, { kind: 'up', id: 7, t: 1600, inside: true });
  assert.deepEqual(r.actions, ['start', 'none', 'fire', 'none', 'swallow']);
  assert.equal(r.state.phase, 'idle');
});

test('early release inside the button: tap (mouse shoots, touch opens the menu)', () => {
  const r = run(down(1000), { kind: 'tick', t: 1200 }, { kind: 'up', id: 7, t: 1300, inside: true });
  assert.deepEqual(r.actions, ['start', 'none', 'tap']);
  assert.equal(r.state.phase, 'idle');
});

test('a late release without tick (timer missed) still fires', () => {
  assert.deepEqual(run(down(1000), { kind: 'up', id: 7, t: 1500, inside: true }).actions, ['start', 'fire']);
});

test('move cancel: 12 px or more, or leaving the button, slips back to an ordinary press; small jitter is kept', () => {
  assert.deepEqual(run(down(), { kind: 'move', id: 7, x: 108, y: 25, inside: true }, { kind: 'tick', t: 1450 }).actions, ['start', 'none', 'fire'], '9.4 px jitter');
  const moved = run(down(), { kind: 'move', id: 7, x: 112, y: 20, inside: true }, { kind: 'tick', t: 1450 }, { kind: 'up', id: 7, t: 1500, inside: true });
  assert.deepEqual(moved.actions, ['start', 'slip', 'none', 'none']);
  assert.deepEqual(run(down(), { kind: 'move', id: 7, x: 101, y: 20, inside: false }).actions, ['start', 'slip']);
  assert.deepEqual(run(down(), { kind: 'move', id: 7, x: NaN, y: 20, inside: true }).actions, ['start', 'slip'], 'non-finite → slip');
  assert.deepEqual(run(down(1000), { kind: 'up', id: 7, t: 1100, inside: false }).actions, ['start', 'slip'], 'released outside');
});

test('pointercancel: nothing happens (no menu, no shot), back to idle; after a fire it is swallowed', () => {
  const r = run(down(), { kind: 'cancel', id: 7 }, { kind: 'tick', t: 2000 });
  assert.deepEqual(r.actions, ['start', 'cancel', 'none']);
  assert.equal(r.state.phase, 'idle');
  assert.deepEqual(run(down(1000), { kind: 'tick', t: 1450 }, { kind: 'cancel', id: 7 }).actions, ['start', 'fire', 'swallow']);
});

test('other pointers are ignored while a hold is pending; a stale fired state restarts on the next press', () => {
  const r = run(down(1000), { kind: 'down', id: 8, x: 300, y: 300, t: 1100, inside: false }, { kind: 'move', id: 8, x: 400, y: 400, inside: false }, { kind: 'up', id: 8, t: 1200, inside: false }, { kind: 'tick', t: 1450 });
  assert.deepEqual(r.actions, ['start', 'none', 'none', 'none', 'fire']);
  const stale = run(down(1000), { kind: 'tick', t: 1450 }, down(5000));
  assert.deepEqual(stale.actions, ['start', 'fire', 'start']);
  assert.equal(stale.state.start, 5000);
});

test('main.js: the MENU press goes through longPress for every pointer type, with pointerup / pointercancel and a deferred mouse shot', () => {
  const main = read('.compiled/main.js');
  assert.match(main, /longPress\(/);
  assert.match(main, /LONG_PRESS_MS/);
  assert.match(main, /'pointerup'/);
  assert.match(main, /'pointercancel'/);
  assert.match(main, /menuPressed:/, 'HUD cue during the hold');
  assert.match(main, /case 'fire':/);
  assert.match(main, /case 'tap':/);
  assert.match(main, /case 'slip':/);
});

test('render.js: MENU drawn in its pressed state (third MenuButton frame) while held', () => {
  const render = read('.compiled/render.js');
  assert.match(render, /menuPressed/);
  assert.match(render, /sw \* 2/, 'pressed frame of the 297 × 25 strip');
});

test('help line and README: « Appui long sur MENU : menu »', () => {
  assert.match(CONTROLS_HELP, /Appui long sur MENU : menu/);
  assert.match(read('README.md'), /Appui long sur MENU/);
});
