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

// ---------------------------------------------------------------- menu de jeu = dialogue OPTIONS « en jeu » (0x445310, D-24)
import { MENU_LAYOUT, menuWidgets, hitMenu, sliderValue, composeMenuDialog, CONTROLS_HELP } from '../.compiled/menudialog.js';
import { AudioManager } from '../.compiled/audio.js';

const PACK_STRINGS = {
  MENU: 'MENU', MUSIC_VOLUME: 'Musique', SOUND_EFFECTS: 'Sons', FULLSCREEN: 'Plein écran', HELP: 'Aide', BACK_TO_MAIN_MENU: 'Retour au menu principal',
  BACK_TO_GAME: 'Retour à la partie', DONE: 'Terminé', LEAVE: 'Quitter', CANCEL: 'ANNULER', 'LEAVE_GAME_?': 'Quitter la partie ?', 'QUIT_THE_GAME_?': 'Voulez-vous vraiment&cr;quitter la partie ?',
};
const inside = (r, f) => r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('menuWidgets(menu): Musique (inert), Sons, Plein écran + Pixels nets on one row, Aide, Retour au menu principal, Retour à la partie — inside the frame, disjoint, top to bottom', () => {
  for (const strings of [PACK_STRINGS, null]) {
    const w = menuWidgets('menu', strings);
    assert.deepEqual(w.map(x => x.id), ['music', 'sfx', 'fullscreen', 'pixels', 'help', 'main-menu', 'back']);
    assert.deepEqual(w.map(x => x.kind), ['slider', 'slider', 'check', 'check', 'button', 'button', 'button']);
    assert.deepEqual(w.map(x => x.label), ['Musique', 'Sons', 'Plein écran', 'Pixels nets', 'Aide', 'Retour au menu principal', 'Retour à la partie'], strings ? 'pack strings' : 'French fallbacks');
    assert.deepEqual(w.map(x => x.enabled), [false, true, true, true, true, true, true], 'music greyed (no music before phases 6–7)');
    for (const x of w) {
      assert.ok(inside(x.rect, MENU_LAYOUT.frame), `${x.id} inside the frame`);
      assert.ok(inside(x.rect, { x: 0, y: 0, w: 640, h: 480 }), `${x.id} on the stage`);
    }
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) assert.ok(!overlap(w[i].rect, w[j].rect), `${w[i].id} / ${w[j].id} disjoint`);
    const y = Object.fromEntries(w.map(x => [x.id, x.rect.y]));
    assert.equal(y.fullscreen, y.pixels, 'the two check boxes share a row');
    assert.ok(y.music < y.sfx && y.sfx < y.fullscreen && y.pixels < y.help && y.help < y['main-menu'] && y['main-menu'] < y.back, 'original vertical order');
    assert.ok(w[2].rect.x < w[3].rect.x);
  }
  const f = MENU_LAYOUT.frame;
  assert.ok(inside(f, { x: 0, y: 0, w: 640, h: 480 }));
  assert.equal(MENU_LAYOUT.head.y, f.y - 83, 'GodHead above the frame like the STATS (hypothesis)');
  assert.ok(MENU_LAYOUT.title.baseline > MENU_LAYOUT.head.y + 140, 'title under the head');
  const slider = menuWidgets('menu', null)[0].rect;
  assert.equal(slider.w, 205, 'slidertrack drawn at its logical width');
  assert.equal(slider.x, f.x + 30 + 130, 'slider 130 px right of the content edge (0x4402f7)');
});

test('menuWidgets(help) = Terminé; menuWidgets(confirm) = Quitter / ANNULER', () => {
  assert.deepEqual(menuWidgets('help', PACK_STRINGS).map(w => [w.id, w.kind, w.label]), [['help-done', 'button', 'Terminé']]);
  assert.deepEqual(menuWidgets('confirm', PACK_STRINGS).map(w => [w.id, w.label]), [['leave', 'Quitter'], ['cancel', 'ANNULER']]);
  assert.deepEqual(menuWidgets('confirm', null).map(w => w.label), ['Quitter', 'ANNULER']);
  for (const view of ['help', 'confirm']) for (const w of menuWidgets(view, null)) assert.ok(inside(w.rect, MENU_LAYOUT.frame));
});

test('hitMenu returns the enabled widget under the point; sliderValue maps x into 0..1', () => {
  const w = menuWidgets('menu', null);
  const at = id => { const r = w.find(x => x.id === id).rect; return [r.x + r.w / 2, r.y + r.h / 2]; };
  assert.equal(hitMenu(w, ...at('back')).id, 'back');
  assert.equal(hitMenu(w, ...at('sfx')).id, 'sfx');
  assert.equal(hitMenu(w, ...at('pixels')).id, 'pixels');
  assert.equal(hitMenu(w, ...at('music')), null, 'a disabled widget is not hit');
  assert.equal(hitMenu(w, 5, 5), null);
  assert.equal(hitMenu(w, NaN, 200), null);
  const r = { x: 100, y: 0, w: 200, h: 30 };
  assert.equal(sliderValue(r, 100), 0);
  assert.equal(sliderValue(r, 200), 0.5);
  assert.equal(sliderValue(r, 300), 1);
  assert.equal(sliderValue(r, 50), 0);
  assert.equal(sliderValue(r, 999), 1);
  assert.equal(sliderValue(r, NaN), 0);
  assert.equal(sliderValue({ x: 0, y: 0, w: 0, h: 0 }, 5), 0, 'empty rect');
});

test('CONTROLS_HELP lists the R2.0.18 bindings (right click swaps, Space / Enter / Escape = menu, Tab, P)', () => {
  assert.match(CONTROLS_HELP, /Clic droit : échanger/);
  assert.match(CONTROLS_HELP, /Espace \/ Entrée \/ Échap : menu/);
  assert.match(CONTROLS_HELP, /Tab/);
  assert.match(CONTROLS_HELP, /P : pause/);
  assert.doesNotMatch(CONTROLS_HELP, /Espace : échanger/);
});

/** A canvas whose 2D context records every call (any method, any property), like the drawNineSlice test. */
const fakeCanvas = () => {
  const calls = [];
  const target = {};
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args) => {
        calls.push([prop, args]);
        if (prop === 'measureText') return { width: 7 * String(args[0]).length };
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return { addColorStop() {} };
        return undefined;
      };
    },
    set(t, prop, value) { t[prop] = value; return true; },
  });
  return { width: 0, height: 0, getContext: () => ctx, calls };
};
const fakeFont = { ascent: 14, height: 18, capHeight: 12, draw() {}, measure: s => 7 * String(s).length };
const fakeKit = pixelScale => ({
  stats: { frame: { width: 486, height: 484 }, head: { width: 312, height: 280 }, button: { width: 720, height: 96 }, fonts: { title: fakeFont, text: fakeFont, tip: fakeFont, tipSmall: null }, strings: PACK_STRINGS, pixelScale },
  sliderTrack: { width: 205 * pixelScale, height: 33 * pixelScale }, sliderThumb: { width: 41 * pixelScale, height: 33 * pixelScale }, check: { width: 100 * pixelScale, height: 46 * pixelScale }, pixelScale,
});
const state = (view = 'menu', extra = {}) => ({ view, music: 0, sfx: 0.7, fullscreen: false, pixelated: true, hover: null, pressed: null, focus: 'back', tips: ['Astuce une.', 'Astuce&cr;deux.'], badge: 'R2.0.18 · test · ressources originales', ...extra });

test('composeMenuDialog: kit or vector fallback, every view and state, on the canvas at the given scale', () => {
  for (const view of ['menu', 'help', 'confirm']) {
    for (const extra of [{}, { hover: 'help' }, { pressed: 'back' }, { focus: 'sfx' }, { hover: 'leave', focus: 'cancel' }]) {
      const vector = fakeCanvas();
      assert.equal(composeMenuDialog(null, state(view, extra), vector, 2), vector);
      assert.equal(vector.width, 1280);
      assert.equal(vector.height, 960);
      assert.ok(vector.calls.length > 10, 'vector dialog drawn');
      assert.ok(!vector.calls.some(([m]) => m === 'drawImage'), 'no picture without the kit');
      const native = fakeCanvas();
      composeMenuDialog(fakeKit(2), state(view, extra), native, 3.125);
      assert.equal(native.width, 2000);
      assert.equal(native.height, 1500);
      const images = native.calls.filter(([m]) => m === 'drawImage');
      const f = MENU_LAYOUT.frame;
      assert.deepEqual(images[0][1].slice(1), [22, 0, 72, 72, f.x, f.y, 36, 36], 'frame 9-slice cut at kit.pixelScale');
    }
  }
  const one = fakeCanvas();
  composeMenuDialog(fakeKit(1), state(), one, 1);
  assert.deepEqual(one.calls.find(([m]) => m === 'drawImage')[1].slice(1), [11, 0, 36, 36, MENU_LAYOUT.frame.x, MENU_LAYOUT.frame.y, 36, 36]);
  const big = fakeCanvas();
  composeMenuDialog(null, state(), big, 9);
  assert.equal(big.width, 2560, 'scale bounded to 4');
  const src = read('.compiled/menudialog.js');
  assert.doesNotMatch(src, /^\S[^\n]*\bdocument\b/m, 'no DOM access at module level');
  assert.match(src, /ctx\.setTransform\(s, 0, 0, s, 0, 0\)/);
  assert.match(src, /0\.45/, 'disabled widget at 45 % opacity');
});

test('AudioManager: setVolume bounded 0..1 (NaN → 1), master gain = 0.8 × volume', () => {
  const audio = new AudioManager();
  assert.equal(audio.volume, 1);
  audio.setVolume(0.5);
  assert.equal(audio.volume, 0.5);
  audio.setVolume(2);
  assert.equal(audio.volume, 1);
  audio.setVolume(-1);
  assert.equal(audio.volume, 0);
  audio.setVolume(NaN);
  assert.equal(audio.volume, 1);
  assert.match(read('.compiled/audio.js'), /0\.8 \* this\.volume/);
});

test('shell and bundle: no DOM menu panel, .menu-picture without url(, menudialog after render in MODULES and precached; main.js composes the menu and pauses under it', () => {
  const html = read('index.html');
  for (const id of ['menu-panel', 'menu-resume', 'menu-new', 'menu-sound', 'menu-pixels', 'menu-fullscreen']) assert.doesNotMatch(html, new RegExp(id), `${id} gone`);
  assert.match(html, /<section id="menu" class="overlay" aria-label="Menu"><\/section>/);
  const css = read('public/style.css');
  assert.doesNotMatch(css, /\.menu-panel/);
  const rule = css.match(/\.menu-picture\s*\{[^}]*\}/);
  assert.ok(rule, '.menu-picture rule');
  assert.doesNotMatch(rule[0], /url\(/);
  assert.match(rule[0], /position:\s*absolute/);
  const build = read('tools/build.mjs');
  assert.match(build, /const MODULES = \['core', 'feedback', 'levels', 'audio', 'upscale', 'original', 'bitmapfont', 'statsdialog', 'render', 'menudialog', 'main'\]/);
  assert.match(read('public/sw.js'), /\.\/js\/menudialog\.js/);
  const main = read('.compiled/main.js');
  assert.match(main, /composeMenuDialog\(/);
  assert.match(main, /loadMenuKit\(/);
  assert.match(main, /upscaleMenuKit\(/);
  assert.match(main, /!this\.paused && !this\.statsOpen && !this\.menuOpen/, 'the engine does not step under the menu');
  const open = body(main, '    openMenu() {');
  assert.match(open, /stopLoops\(\)/, 'loops cut at the opening');
  assert.doesNotMatch(main, /syncPixelsLabel|menu-sound|menu-resume/);
});

// ---------------------------------------------------------------- entrées sur toute la fenêtre, taille d'écran (D-25, D-26)
import { stagePoint, fitScale } from '../.compiled/render.js';

test('stagePoint: client coordinates → logical 640 × 480, clamped to the stage; degenerate input → the centre', () => {
  const rect = { left: 100, top: 50, width: 1280, height: 960 };
  assert.deepEqual(stagePoint(100, 50, rect), { x: 0, y: 0 });
  assert.deepEqual(stagePoint(1380, 1010, rect), { x: 640, y: 480 });
  assert.deepEqual(stagePoint(740, 530, rect), { x: 320, y: 240 });
  assert.deepEqual(stagePoint(0, 0, rect), { x: 0, y: 0 }, 'page frame left / top → clamped');
  assert.deepEqual(stagePoint(5000, 300, rect), { x: 640, y: 125 }, 'right of the page: x clamped, y proportional');
  assert.deepEqual(stagePoint(10, 10, { left: 0, top: 0, width: 0, height: 0 }), { x: 320, y: 240 });
  assert.deepEqual(stagePoint(NaN, 10, rect), { x: 320, y: 240 });
  assert.deepEqual(stagePoint(10, 10, { left: 0, top: 0, width: Infinity, height: 480 }), { x: 320, y: 240 });
});

test('fitScale: the window is filled in 4:3; « Pixels nets » rounds to whole device pixels, never under one device pixel per logical pixel', () => {
  assert.equal(fitScale(1000, 750, 2, false), 1.5625);
  assert.equal(fitScale(1000, 750, 2, true), 1.5);
  assert.equal(fitScale(1440, 900, 2, true), 1.5, 'fit 1.875 → ⌊3.75⌋ / 2');
  assert.equal(fitScale(1440, 900, 2, false), 1.875);
  assert.equal(fitScale(1440, 900, 1, true), 1);
  assert.equal(fitScale(1920, 1080, 1, true), 2);
  assert.equal(fitScale(600, 450, 1, true), 1, 'never less than one device pixel');
  assert.equal(fitScale(600, 450, 2, true), 0.5, 'one device pixel per logical pixel');
  assert.equal(fitScale(NaN, 750, 2, false), 1);
  assert.equal(fitScale(1000, 750, NaN, true), 1, 'dpr defaults to 1');
  assert.equal(fitScale(Infinity, Infinity, 1, false), 1);
});

test('main.js: aim and shots on the whole window through stagePoint, right click swaps, keys Space / Enter / Escape = menu, Tab = STATS, P = pause; HUD buttons only by touch', () => {
  const main = read('.compiled/main.js');
  const input = body(main, '    bindInput() {');
  assert.match(input, /window\.addEventListener\('pointermove'/);
  assert.match(input, /window\.addEventListener\('pointerdown'/);
  assert.match(input, /window\.addEventListener\('contextmenu'/);
  assert.match(input, /stagePoint\(/);
  assert.doesNotMatch(main, /canvas\.addEventListener\('(mousemove|mousedown|touchstart)'/, 'no canvas-only listeners');
  assert.match(input, /button === 2[^;]*\n?[^;]*kind: 'swap'/, 'right click = swap');
  assert.doesNotMatch(main, /p\.y < HUD_HEIGHT/, 'a click in the HUD band shoots');
  assert.doesNotMatch(input, /'Space'[^;]*swap/, 'Space no longer swaps');
  assert.match(input, /'Space'/);
  assert.match(input, /'Enter'/);
  assert.match(input, /'NumpadEnter'/);
  assert.match(input, /'Escape'/);
  assert.match(input, /toggleMenu\(\)/);
  assert.match(input, /'Tab'[\s\S]*?openStats\('live'\)/);
  assert.match(input, /preventDefault\(\)/);
  assert.match(input, /'KeyP'[\s\S]*?togglePause\(\)/);
  assert.match(input, /pointerType === 'touch'[\s\S]*?hitTest\(/, 'HUD buttons for touch only');
  assert.equal((input.match(/hitTest\(/g) || []).length, 1);
  const scaling = body(main, '    applyScaling() {');
  assert.match(scaling, /fitScale\(/);
  assert.match(scaling, /--k/);
});

test('style.css: the stage is sized by --k in both modes (4:3 fallback before the first layout); smoothing off only in « Pixels nets »', () => {
  const css = read('public/style.css');
  assert.match(css, /\.stage \{[^}]*width: min\(100vw, calc\(100vh \* 4 \/ 3\)\)/, 'fallback before --k');
  assert.match(css, /\.stage\.sized \{[^}]*width: calc\(640px \* var\(--k\)\);[^}]*height: calc\(480px \* var\(--k\)\)/);
  assert.match(css, /\.stage\.pixelated #game \{ image-rendering: pixelated; \}/);
  assert.doesNotMatch(css, /\.stage\.pixelated \{[^}]*width/, 'no integer-CSS-only rule left');
  assert.doesNotMatch(css, /var\(--k, 1\)/);
});
