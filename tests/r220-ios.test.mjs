// R2.0.20 — iPhone / iPad (plan 05-14, D-38 §3–6) : toucher la grenouille échange les billes, « Tournez votre appareil »
// met en pause sur téléphone en portrait, la scène tient dans les marges sûres, « Plein écran » disparaît sans API
// Fullscreen, rien de sélectionnable ni de zoomable au doigt, audio débloqué au toucher et repris au retour.
// Chromium n'émule ni les marges sûres, ni `audioSession`, ni le stockage isolé d'iOS : vérification réelle en UAT 9.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { frogHit, FROG_TAP_RADIUS } from '../.compiled/render.js';
import { needsRotation, fitArea } from '../.compiled/pwa.js';
import { menuWidgets, MENU_LAYOUT } from '../.compiled/menudialog.js';

const read = file => fs.readFileSync(file, 'utf8');

test('frogHit: within 32 px of the frog centre, false beyond and for non-finite points', () => {
  const frog = { x: 320, y: 240 };
  assert.equal(FROG_TAP_RADIUS, 32);
  assert.equal(frogHit({ x: 320, y: 240 }, frog), true);
  assert.equal(frogHit({ x: 352, y: 240 }, frog), true, 'on the circle');
  assert.equal(frogHit({ x: 320 + 22.7, y: 240 + 22.7 }, frog), false, '32.1 px away');
  assert.equal(frogHit({ x: 353, y: 240 }, frog), false);
  assert.equal(frogHit({ x: 330, y: 250 }, frog, 10), false, 'custom radius');
  assert.equal(frogHit({ x: Number.NaN, y: 240 }, frog), false);
  assert.equal(frogHit({ x: 320, y: Number.POSITIVE_INFINITY }, frog), false);
});

test('needsRotation: phone held in portrait only (coarse pointer, short screen side < 600 px)', () => {
  assert.equal(needsRotation({ width: 393, height: 852, coarse: true, shortSide: 393 }), true, 'iPhone 15 portrait');
  assert.equal(needsRotation({ width: 852, height: 393, coarse: true, shortSide: 393 }), false, 'iPhone 15 landscape');
  assert.equal(needsRotation({ width: 834, height: 1194, coarse: true, shortSide: 834 }), false, 'iPad Pro 11 portrait: bands');
  assert.equal(needsRotation({ width: 1024, height: 1366, coarse: true, shortSide: 1024 }), false, 'iPad Pro 12.9 portrait');
  assert.equal(needsRotation({ width: 500, height: 900, coarse: false, shortSide: 1080 }), false, 'narrow desktop window');
  assert.equal(needsRotation({ width: Number.NaN, height: 900, coarse: true, shortSide: 393 }), false);
});

test('fitArea: inner size minus the safe-area insets, never negative', () => {
  assert.deepEqual(fitArea(852, 393, { top: 0, right: 59, bottom: 21, left: 59 }), { w: 734, h: 372 });
  assert.deepEqual(fitArea(1280, 960, { top: 0, right: 0, bottom: 0, left: 0 }), { w: 1280, h: 960 });
  assert.deepEqual(fitArea(50, 20, { top: 30, right: 40, bottom: 0, left: 40 }), { w: 0, h: 0 });
  assert.deepEqual(fitArea(800, 600, { top: Number.NaN, right: -5, bottom: 0, left: 0 }), { w: 800, h: 600 }, 'unusable insets read as 0');
});

test('menu without Fullscreen API: no « Plein écran » check; « Pixels nets » keeps its box; default list unchanged', () => {
  const ids = ws => ws.map(w => w.id);
  assert.deepEqual(ids(menuWidgets('menu', null)), ['music', 'sfx', 'fullscreen', 'pixels', 'help', 'main-menu', 'back']);
  assert.deepEqual(ids(menuWidgets('menu', null, { fullscreen: true })), ids(menuWidgets('menu', null)));
  const without = menuWidgets('menu', null, { fullscreen: false });
  assert.deepEqual(ids(without), ['music', 'sfx', 'pixels', 'help', 'main-menu', 'back']);
  assert.equal(without.find(w => w.id === 'pixels').rect.x, MENU_LAYOUT.check.xs[1]);
});

test('CSS: safe-area variables applied around the stage; nothing selectable, no callout, no tap highlight; rotate overlay', () => {
  const css = read('public/style.css');
  for (const side of ['top', 'right', 'bottom', 'left']) assert.match(css, new RegExp(`--safe-${side}:\\s*env\\(safe-area-inset-${side},\\s*0px\\)`), side);
  const body = css.slice(css.lastIndexOf('R2.0.20 (D-38)'));
  assert.match(body, /body\s*\{[^}]*padding:\s*var\(--safe-top\) var\(--safe-right\) var\(--safe-bottom\) var\(--safe-left\)/);
  const rule = body.match(/\.stage,\s*#game\s*\{[^}]*\}/);
  assert.ok(rule, '.stage, #game rule');
  for (const decl of ['touch-action:\\s*none', 'user-select:\\s*none', '-webkit-user-select:\\s*none', '-webkit-touch-callout:\\s*none', '-webkit-tap-highlight-color:\\s*transparent']) assert.match(rule[0], new RegExp(decl), decl);
  const html = read('index.html');
  assert.match(html, /id="rotate"[^>]*>[\s\S]*?Tournez votre appareil/);
});

test('main.js: frog tap swaps instead of shooting, no pinch / double-tap zoom, rotation pause owned by the overlay, safe-area fit', () => {
  const main = read('.compiled/main.js');
  const down = main.slice(main.indexOf("addEventListener('pointerdown'"));
  const frog = down.indexOf('frogHit(');
  assert.ok(frog > 0, 'frogHit in the pointerdown handler');
  assert.match(down.slice(frog, frog + 400), /kind: 'swap'/);
  assert.ok(frog < down.indexOf("kind: 'shoot'"), 'checked before the shot');
  assert.match(main, /'gesturestart'/);
  assert.match(main, /'dblclick'/);
  assert.match(main, /pausedByRotation/);
  assert.match(main, /needsRotation\(/);
  assert.match(main, /'orientationchange'/);
  assert.match(main, /fitArea\(window\.innerWidth, window\.innerHeight, /);
  assert.match(main, /fullscreenEnabled/);
});

test('audio.js: audioSession ambient (respects the silent switch), unlock on touchend / pointerup / click, resume when visible', () => {
  const audio = read('.compiled/audio.js');
  assert.match(audio, /audioSession/);
  assert.match(audio, /'ambient'/);
  assert.doesNotMatch(audio, /'playback'/);
  for (const ev of ['touchend', 'pointerup', 'click', 'visibilitychange']) assert.match(audio, new RegExp(`'${ev}'`), ev);
  assert.match(audio, /'interrupted'/);
  assert.match(read('.compiled/main.js'), /bindUnlock\(/);
});
