// R2.0.20 — astuce du STATS : police Arial12Bold du pack, texte complet, jamais en Cancun10 majuscules tronqué.
// Constat (capture R2.0.20, niveau 3-3) : « FAITES TRAVERSER UN ESPACE VIDE OU PLUS À UNE BALLE POUR OBTENIR UN... »
// en Cancun10 alors que la capture R2.0.19 montrait « Appuyez sur la barre d'espace / pour mettre le jeu en pause. »
// en Arial12Bold. Cause : le kit charge bien Arial12Bold (fonts.tip), mais la mise en page D-20 (deux lignes de
// 270 px après « ASTUCE : ») ne loge que 2 des 7 astuces du pack en Arial12Bold ; pour les 5 autres, layoutTip
// passait à Cancun10 (minuscules → majuscules) puis coupait avec « ... ». L'astuce étant tirée au hasard, la capture
// R2.0.19 était tombée sur une astuce courte. Deux lignes ne suffisent pas en Arial12Bold : la plus longue
// (CREATE_COMBOS…) demande 451 px par ligne, plus que le cadre entier (422 px).
// Correctif : colonne après l'étiquette sur deux lignes quand l'astuce y tient (inchangé), sinon paragraphe à
// étiquette en tête sur trois lignes (première ligne après « ASTUCE : », suivantes sous l'étiquette), toujours en
// Arial12Bold ; police réduite puis points de suspension seulement au-delà.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fontMetrics } from '../.compiled/bitmapfont.js';
import { STATS_LAYOUT, TIP_KEYS, loadStatsKit, upscaleStatsKit, composeStatsDialog, layoutTipBlock, wrapText } from '../.compiled/statsdialog.js';

const PACK = 'private_assets/pack/';
const HAS_PACK = ['fonts/arial12bold.txt', 'fonts/cancun10.txt', 'fonts/cancun12.txt', 'fonts/nativealienextended18.txt', 'strings.json'].every(f => fs.existsSync(PACK + f));
const ELLIPSIS = /(…|\.\.\.)$/;
const norm = s => s.replace(/&cr;/g, ' ').split(/\s+/).filter(Boolean).join(' ');

/** Minimal PopCap script: one layer whose picture stem is `stem`, `w` px per character. */
function syntheticScript(stem, w) {
  const chars = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzàâçéèêëîïôûù0123456789!?.,;:\'-'];
  const list = chars.map(c => `'${c === "'" ? "\\'" : c}'`).join(', ');
  return [
    `Define CharList ( ${list}, ' ' );`,
    `Define WidthList ( ${chars.map(() => w).join(', ')}, 4 );`,
    `Define RectList ( ${chars.map((_, i) => `( ${i * w}, 0, ${w}, 12 )`).join(', ')} );`,
    'CreateLayer Main;',
    `LayerSetImage Main '${stem}';`,
    'LayerSetAscent Main 14;',
    'LayerSetCharWidths Main CharList WidthList;',
    `Define GlyphList ( ${list} );`,
    'LayerSetImageMap Main GlyphList RectList;',
  ].join('\n');
}

/**
 * A pack object accepted by loadStatsKit in Node: pictures are plain sizes, scripts are served by a mocked fetch
 * (`scripts[path]`), strings by `strings()`. `fonts` = the font keys the pack provides.
 */
function fakePack(fonts, scripts, strings) {
  const entries = Object.fromEntries(fonts.map(k => [k, { script: `fonts/${k}.txt`, image: null, mask: `fonts/_${k}.gif` }]));
  return {
    base: 'pack/',
    data: { fonts: entries, strings: 'strings.json' },
    image: async () => ({ width: 512, height: 64 }),
    masked: async () => ({ width: 240, height: 231 }),
    strings: async () => strings,
    scripts,
  };
}

async function withFetch(scripts, run) {
  const saved = globalThis.fetch;
  globalThis.fetch = async url => {
    const key = String(url).replace(/^pack\//, '');
    return key in scripts ? { ok: true, text: async () => scripts[key] } : { ok: false, text: async () => '' };
  };
  try { return await run(); } finally { globalThis.fetch = saved; }
}

const FONT_KEYS = ['nativealienextended18', 'cancun12', 'arial12bold', 'cancun10'];
const stemOf = font => font?.script.layers[0]?.image ?? null;

test('loadStatsKit: Arial12Bold is the tip font whenever the pack provides it, Cancun10 only its fallback', async () => {
  const scripts = Object.fromEntries(FONT_KEYS.map((k, i) => [`fonts/${k}.txt`, syntheticScript(k, 6 + i)]));
  const strings = { TIP: 'ASTUCE' };
  const kit = await withFetch(scripts, () => loadStatsKit(fakePack(FONT_KEYS, scripts, strings)));
  assert.ok(kit, 'kit loaded from the fake pack');
  assert.equal(stemOf(kit.fonts.tip), 'arial12bold', 'tip font = Arial12Bold');
  assert.equal(stemOf(kit.fonts.tipSmall), 'cancun10', 'Cancun10 kept as the smaller fallback');
  assert.equal(stemOf(kit.fonts.text), 'cancun12');
  // The 2 × kit keeps the same fonts (in Node no picture can be upscaled: the 1 × kit comes back unchanged).
  const hd = upscaleStatsKit(kit);
  assert.equal(stemOf(hd.fonts.tip), 'arial12bold');
  // Without Arial12Bold in the pack: Cancun10 is the tip font and there is no smaller one.
  const noArial = FONT_KEYS.filter(k => k !== 'arial12bold');
  const fallback = await withFetch(scripts, () => loadStatsKit(fakePack(noArial, scripts, strings)));
  assert.equal(stemOf(fallback.fonts.tip), 'cancun10');
  assert.equal(fallback.fonts.tipSmall, null);
});

test('layoutTipBlock: two lines after the label when they hold the tip (R2.0.19 look), else a three-line run-in paragraph in the same font', () => {
  const m = s => 7 * s.length;
  const label = 71;
  const { tip } = STATS_LAYOUT;
  const textX = tip.labelX + label + tip.gap;
  const short = layoutTipBlock("Appuyez sur la barre d'espace pour mettre le jeu en pause.", label, m, s => 6 * s.length);
  assert.equal(short.small, false);
  assert.equal(short.lines.length, 2);
  assert.ok(short.lines.every(l => l.x === textX), 'column after the label');
  assert.deepEqual(short.lines.map(l => l.baseline), [tip.baseline - Math.round(tip.lineHeight / 2), tip.baseline - Math.round(tip.lineHeight / 2) + tip.lineHeight]);
  assert.equal(short.labelBaseline, tip.baseline, 'label centred on the two lines as before');

  const text = 'Créez des combos de deux explosions ou plus pour marquer plus de points et faire reculer la colonne de balles !';
  const long = layoutTipBlock(text, label, m, s => 6 * s.length);
  assert.equal(long.small, false, 'no switch to the smaller font');
  assert.equal(long.lines.length, 3);
  assert.equal(long.lines[0].x, textX, 'first line after the label');
  assert.ok(long.lines.slice(1).every(l => l.x === tip.labelX), 'next lines under the label');
  assert.equal(long.labelBaseline, long.lines[0].baseline, 'label on the first line');
  assert.deepEqual(long.lines.map(l => l.baseline), [tip.runInFirst, tip.runInFirst + tip.lineHeight, tip.runInFirst + 2 * tip.lineHeight]);
  assert.ok(tip.runInFirst - 14 >= tip.box.y && tip.runInFirst + 2 * tip.lineHeight + 3 <= tip.box.y + tip.box.h, 'three Arial12Bold lines (ascent 14, descent 3) inside the inset');
  assert.equal(norm(long.lines.map(l => l.text).join(' ')), norm(text), 'complete text');
  assert.ok(long.lines.every(l => !ELLIPSIS.test(l.text)));
  const right = tip.box.x + tip.box.w - 10;
  assert.ok(long.lines.every(l => l.x + m(l.text) <= right), 'every line inside the inset');
  // Beyond three lines: the R2.0.17 path (smaller font, then the ellipsis) is kept.
  const huge = layoutTipBlock(`${text} ${text} ${text}`, label, m, s => 6 * s.length, '...');
  assert.ok(huge.lines.length <= tip.maxLines);
  assert.ok(ELLIPSIS.test(huge.lines[huge.lines.length - 1].text));
});

/** A recording 2D context: every method is a no-op, `calls` keeps nothing — the fonts record their own draws. */
function fakeCanvas() {
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => undefined), set: (t, p, v) => { t[p] = v; return true; } });
  return { width: 0, height: 0, getContext: () => ctx };
}

function fakeFont(name, perChar, log) {
  return {
    name, ascent: 14, height: 17, capHeight: 11, pixelScale: 1,
    measure: s => (s === '…' ? 0 : perChar * [...s].length),
    draw: (_ctx, text, x, y) => { log.push({ font: name, text, x, y }); return perChar * text.length; },
  };
}

test('composeStatsDialog draws every original-length tip complete with the tip font (never the smaller one, never an ellipsis)', () => {
  const log = [];
  const kit = {
    frame: { width: 240, height: 231 }, head: null, button: { width: 360, height: 48 },
    fonts: { title: fakeFont('title', 12, log), text: fakeFont('text', 9, log), tip: fakeFont('tip', 7, log), tipSmall: fakeFont('small', 8, log) },
    strings: { TIP: 'ASTUCE' }, pixelScale: 1,
  };
  const values = { points: '0', combos: '0', coins: '0', gaps: '0', chain: '0', comboMax: '0', time: '0 s', objective: '1:20', bonus: 'PAS DE BONUS', record: '0 s' };
  const tip = 'Faites traverser un espace vide ou plus à une balle pour obtenir un bonus de saut ou de double saut !';
  composeStatsDialog(kit, values, { revealed: 10, button: 'normal', tip }, fakeCanvas(), 1);
  const label = log.find(d => d.text === 'ASTUCE :');
  const lines = log.filter(d => d.font === 'tip' || d.font === 'small');
  assert.ok(label, 'label drawn');
  assert.ok(lines.length >= 1 && lines.length <= 3);
  assert.ok(lines.every(d => d.font === 'tip'), 'drawn with the tip font');
  assert.equal(norm(lines.map(d => d.text).join(' ')), norm(tip), 'complete');
  assert.equal(label.y, lines[0].y, 'label on the first line of a run-in paragraph');
});

test('pack (when present): every tip of strings.json holds in Arial12Bold inside the tip inset, without ellipsis', { skip: !HAS_PACK }, async () => {
  const scripts = Object.fromEntries(FONT_KEYS.map(k => [`fonts/${k}.txt`, fs.readFileSync(`${PACK}fonts/${k}.txt`, 'utf8')]));
  const strings = JSON.parse(fs.readFileSync(`${PACK}strings.json`, 'utf8'));
  const kit = await withFetch(scripts, () => loadStatsKit(fakePack(FONT_KEYS, scripts, strings)));
  assert.equal(stemOf(kit.fonts.tip), 'arial12bold');
  const arial = kit.fonts.tip;
  const label = kit.fonts.text.measure(`${strings.TIP ?? 'ASTUCE'} :`);
  const { tip, frame, inset } = STATS_LAYOUT;
  const right = tip.box.x + tip.box.w - 10;
  const descent = fontMetrics(arial.script).height - fontMetrics(arial.script).ascent;
  let column = 0;
  for (const key of TIP_KEYS) {
    const text = strings[key];
    assert.equal(typeof text, 'string', key);
    const block = layoutTipBlock(text, label, s => arial.measure(s), s => kit.fonts.tipSmall.measure(s));
    assert.equal(block.small, false, `${key}: Arial12Bold, not Cancun10`);
    assert.ok(block.lines.every(l => !ELLIPSIS.test(l.text)), `${key}: no ellipsis`);
    assert.equal(norm(block.lines.map(l => l.text).join(' ')), norm(text), `${key}: complete`);
    assert.ok(block.lines.length <= 3, `${key}: ${block.lines.length} lines`);
    if (block.lines.length <= 2 && block.lines.every(l => l.x === block.lines[0].x)) column++;
    for (const l of block.lines) {
      assert.ok(l.x + arial.measure(l.text) <= right, `${key}: « ${l.text} » inside the inset`);
      assert.ok(l.baseline - arial.ascent >= tip.box.y, `${key}: line top inside the inset`);
      assert.ok(l.baseline + descent <= tip.box.y + tip.box.h, `${key}: line bottom inside the inset`);
    }
  }
  assert.ok(column >= 2, 'the short tips keep the two-line column of R2.0.19');
  // Why three lines: two lines of Arial12Bold cannot hold the longest tip even across the whole frame.
  const longest = TIP_KEYS.map(k => strings[k]).sort((a, b) => arial.measure(b) - arial.measure(a))[0];
  assert.ok(wrapText(longest, frame.w - 2 * inset, s => arial.measure(s)).length > 2);
});
