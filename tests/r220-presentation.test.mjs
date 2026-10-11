// R2.0.20 — présentation : bouton OK du STATS posé comme un bouton de pied du `Dialog` original (D-36, spike 02 Q5),
// dessiné en trois tranches comme les boutons du menu, zone cliquable DOM alignée sur le dessin ; baseline 2.0.20.
// Lecture de l'exécutable : `Dialog::Resize` 0x4ac160 (un seul bouton : x = fond.g + contenu.g, y = H − contenu.b −
// fond.b − hauteur, largeur = W − les quatre marges horizontales, hauteur = `mButtonHeight` = hauteur de `DialogButton`),
// marges du dialogue posées par 0x43ef30 (fond 0 / 80 / 0 / 0, contenu 36 / 52 / 36 / 36), converties vers notre cadre
// opaque mesuré (le masque de `dialogbox` laisse 11 px à gauche et en bas, 3 px à droite).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STATS_LAYOUT, STATS_OK_RULE, statsOkRect, drawDialogButton, statsRows, STATS_LINE_MIN, STATS_LINE_MAX } from '../.compiled/statsdialog.js';
import { MENU_LAYOUT, menuWidgets } from '../.compiled/menudialog.js';
import { ENGINE_VERSION } from '../.compiled/core.js';

const read = file => fs.readFileSync(file, 'utf8');

// ------------------------------------------------------------ bouton OK du STATS (D-36)

test('statsOkRect: single footer button of Dialog::Resize (0x4ac160) inside a frame', () => {
  const frame = { x: 100, y: 50, w: 400, h: 300 };
  assert.deepEqual(statsOkRect(frame, { left: 30, right: 30, bottom: 22, height: 48 }), { x: 130, y: 50 + 300 - 22 - 48, w: 340, h: 48 });
  assert.deepEqual(statsOkRect(frame, { left: 10, right: 20, bottom: 5, height: 40 }), { x: 110, y: 305, w: 370, h: 40 });
});

test('STATS_OK_RULE: insets read in Zuma.exe converted to our opaque frame (36 − mask margins), DialogButton height 48', () => {
  // Box insets 36 / 36 / 36 (0x43ef30), mask margins 11 left / 3 right / 11 bottom → 25 / 33 / 25 around the opaque
  // frame; the 4 px horizontal asymmetry is shared (29 / 29) because our frame is centred like the original box.
  assert.deepEqual(STATS_OK_RULE, { left: 29, right: 29, bottom: 25, height: 48 });
  assert.equal(STATS_OK_RULE.left + STATS_OK_RULE.right, 2 * 36 - (11 + 3), 'button width = box width − 72');
  assert.deepEqual(STATS_LAYOUT.ok, statsOkRect(STATS_LAYOUT.frame, STATS_OK_RULE));
  assert.deepEqual(STATS_LAYOUT.ok, { x: 138, y: 373, w: 364, h: 48 });
});

test('the OK sits in the frame, centred on 320, under the tip; label baseline derived from the rectangle', () => {
  const { ok, frame, tip } = STATS_LAYOUT;
  assert.ok(ok.x >= frame.x && ok.x + ok.w <= frame.x + frame.w, 'inside horizontally');
  assert.ok(ok.y >= frame.y && ok.y + ok.h <= frame.y + frame.h, 'inside vertically');
  assert.equal(ok.x + ok.w / 2, 320, 'centred');
  assert.equal(STATS_LAYOUT.okLabelBaseline, ok.y + (ok.h - 48) / 2 + 30);
  // Two tip lines: first at baseline − lineHeight / 2, second lineHeight lower.
  const second = tip.baseline - Math.round(tip.lineHeight / 2) + tip.lineHeight;
  assert.ok(second + 4 <= ok.y, `second tip line (${second}) above the OK (${ok.y})`);
  assert.ok(tip.box.y + tip.box.h <= ok.y - 2, 'the tip inset ends above the OK');
  // The rows still clear the tip box for every allowed line height (r216 lock kept).
  for (let lh = STATS_LINE_MIN; lh <= STATS_LINE_MAX; lh++) {
    const r = statsRows(lh, STATS_LAYOUT.left.first);
    for (const y of r.left) assert.ok(y < tip.box.y, `row ${y} above the tip box (lh ${lh})`);
  }
});

test('the menu footer keeps its R2.0.18 rectangle (fallback rule 30 / 30 / 22 of D-36 applied to MENU_LAYOUT.frame)', () => {
  const back = menuWidgets('menu', null).find(w => w.id === 'back');
  assert.deepEqual(back.rect, { x: 150, y: 404, w: 340, h: 48 });
  assert.deepEqual(back.rect, statsOkRect(MENU_LAYOUT.frame, { left: 30, right: 30, bottom: 22, height: 48 }));
});

test('CSS: the transparent OK control covers the painted button exactly (percentages of 640 × 480)', () => {
  const css = read('public/style.css');
  const rule = css.match(/#stats\.stats-original \.stats-ok\{[^}]*\}/);
  assert.ok(rule, 'native OK rule');
  const pct = name => Number(rule[0].match(new RegExp(`[;{]${name}:([0-9.]+)%`))[1]);
  const { ok } = STATS_LAYOUT;
  assert.ok(Math.abs(pct('left') - 100 * ok.x / 640) <= 0.01, `left ${pct('left')}`);
  assert.ok(Math.abs(pct('top') - 100 * ok.y / 480) <= 0.01, `top ${pct('top')}`);
  assert.ok(Math.abs(pct('width') - 100 * ok.w / 640) <= 0.01, `width ${pct('width')}`);
  assert.ok(Math.abs(pct('height') - 100 * ok.h / 480) <= 0.01, `height ${pct('height')}`);
});

test('drawDialogButton: three slices of one DialogButton state (22 px edges, stretched centre), source scale applied', () => {
  const calls = [];
  const ctx = { drawImage: (_img, ...rest) => calls.push(rest) };
  const rect = { x: 138, y: 373, w: 364, h: 48 };
  drawDialogButton(ctx, {}, 'normal', rect, 1);
  assert.deepEqual(calls, [
    [0, 0, 22, 48, 138, 373, 22, 48],
    [22, 0, 76, 48, 160, 373, 320, 48],
    [98, 0, 22, 48, 480, 373, 22, 48],
  ]);
  calls.length = 0;
  drawDialogButton(ctx, {}, 'pressed', rect, 2);
  assert.deepEqual(calls[0], [480, 0, 44, 96, 138, 373, 22, 48], 'pressed = third state, 2 × source');
  assert.deepEqual(calls[2], [676, 0, 44, 96, 480, 373, 22, 48]);
  calls.length = 0;
  drawDialogButton(ctx, {}, 'hover', { x: 0, y: 0, w: 120, h: 48 }, 1);
  assert.deepEqual(calls[1], [142, 0, 76, 48, 22, 0, 76, 48], 'a 120 px button is drawn 1:1');
});

test('the STATS and the menu draw their buttons with the shared helper', () => {
  const stats = read('.compiled/statsdialog.js');
  const start = stats.indexOf('export function composeStatsDialog');
  const compose = stats.slice(start, stats.indexOf('\n}', start));
  assert.match(compose, /drawDialogButton\(ctx, kit\.button, /);
  assert.doesNotMatch(compose, /ctx\.drawImage\(kit\.button/, 'no single 120 px drawImage any more');
  assert.match(read('.compiled/menudialog.js'), /drawDialogButton\(ctx, kit\.stats\.button, /);
});

// ------------------------------------------------------------ baseline

test('baseline 2.0.20: ENGINE_VERSION and package.json agree', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(ENGINE_VERSION, '2.0.20');
  assert.equal(pkg.version, '2.0.20');
  assert.match(pkg.description, /^Zuma R2\.0\.20 /);
});
