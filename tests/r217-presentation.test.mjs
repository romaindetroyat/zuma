// R2.0.17 — présentation : textes et sons du score, STATS D-20, compte à rebours D-21, roulement, netteté D-19 (plan 05-08)
// Libellés originaux (« +N » couleur de la bille, COMBO x, BONUS … SAUT sans montant, ENCHAÎNEMENT x), `gapbonus1`
// différé de 0 / 150 / 300 ms, grille du STATS, formateur unique, astuce sur deux lignes, décompte borné avec
// mode rapide, rampe du roulement armée une fois par cible, filtre pixel-art 2 × et composition à l'échelle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { soundCues, ballCss, PARTICLE_RGB } from '../.compiled/feedback.js';
import { clampDelay } from '../.compiled/audio.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (± ${eps})`);
const read = file => fs.readFileSync(file, 'utf8');
/** Body of a `case '<kind>'` block of the compiled handleEvents, up to the next `case '`. */
const caseBlock = (src, kind) => {
  const start = src.indexOf(`case '${kind}'`);
  assert.ok(start > 0, `case '${kind}' compiled`);
  const end = src.indexOf("case '", start + 8);
  return src.slice(start, end > 0 ? end : undefined);
};

// ---------------------------------------------------------------- sons du score (recherche 02 Q1–Q2)

test('cues: gapbonus1 once per gap up to three, at 0 / 150 / 300 ms (15 / 30 maj) and 0 / +2 / +3 semitones', () => {
  assert.deepEqual(soundCues({ tick: 1, kind: 'gap', count: 1 }), [{ key: 'gap', gain: 1, rate: 1, delay: 0 }]);
  const two = soundCues({ tick: 1, kind: 'gap', count: 2 });
  assert.equal(two.length, 2);
  near(two[1].rate, Math.pow(2, 2 / 12), 1e-12, '+2 semitones');
  assert.equal(two[1].delay, 0.15, '15 maj = 150 ms');
  assert.equal(two[1].key, 'gap');
  const three = soundCues({ tick: 1, kind: 'gap', count: 3 });
  assert.equal(three.length, 3);
  near(three[2].rate, Math.pow(2, 3 / 12), 1e-12, '+3 semitones');
  assert.equal(three[2].delay, 0.3, '30 maj = 300 ms');
  assert.deepEqual(three.map(c => c.delay), [0, 0.15, 0.3]);
  assert.equal(soundCues({ tick: 1, kind: 'gap', count: 7 }).length, 3, 'never more than three');
  assert.ok(three[0].rate < three[1].rate && three[1].rate < three[2].rate, 'rising pitch (r213 lock)');
  for (const c of three) assert.equal(c.gain, 1);
});

test('cues: chain1 at chain − 5 semitones from the 5th hit; BALLDESTROYED1..5 by combo with chime1 at 2 × combo semitones and 0.4 + 0.2 × combo', () => {
  assert.deepEqual(soundCues({ tick: 1, kind: 'streak', streak: 5, points: 100 }), [{ key: 'streak', gain: 1, rate: 1 }]);
  near(soundCues({ tick: 1, kind: 'streak', streak: 7 })[0].rate, Math.pow(2, 2 / 12), 1e-12, 'chain 7 → +2');
  assert.equal(soundCues({ tick: 1, kind: 'streak', streak: 4 })[0].rate, 1, 'bounded at 5');
  assert.deepEqual(soundCues({ tick: 1, kind: 'destroy', depth: 1 }), [{ key: 'destroy1', gain: 1, rate: 1 }, { key: 'combo', gain: 0.4, rate: 1 }]);
  const d3 = soundCues({ tick: 1, kind: 'destroy', depth: 3 });
  assert.equal(d3[0].key, 'destroy3');
  near(d3[1].gain, 0.8, 1e-12, 'combo 2 → 0.4 + 0.4');
  near(d3[1].rate, Math.pow(2, 4 / 12), 1e-12, 'combo 2 → +4 semitones');
  const d6 = soundCues({ tick: 1, kind: 'destroy', depth: 6 });
  assert.equal(d6[0].key, 'destroy5');
  assert.equal(d6[1].gain, 1, 'volume capped at 1');
});

test('audio.play honours SoundCue.delay, clamped to 0..1 s (T-05-24)', () => {
  assert.equal(clampDelay(undefined), 0);
  assert.equal(clampDelay(NaN), 0);
  assert.equal(clampDelay(-1), 0);
  assert.equal(clampDelay(2), 1);
  assert.equal(clampDelay(0.15), 0.15);
  const audio = read('.compiled/audio.js');
  const start = audio.indexOf('play(cue)');
  assert.ok(start > 0, 'AudioManager.play compiled');
  const body = audio.slice(start, audio.indexOf('setLoop(key, level)', start));
  assert.match(body, /cue\.delay/, 'play reads the delay');
  assert.match(body, /start\(now \+ delay\)/, 'the buffer source starts at now + delay');
  assert.match(body, /clampDelay\(/, 'delay clamped');
});

// ---------------------------------------------------------------- textes flottants (recherche 02 Q1–Q2)

test('ballCss: the « +N » takes the colour of the ball (PARTICLE_RGB), white outside the table', () => {
  assert.equal(ballCss(0), '#1980ff');
  assert.equal(ballCss(1), '#ffff00');
  assert.equal(ballCss(2), '#ff0000');
  assert.equal(ballCss(5), '#ffffff');
  assert.equal(ballCss(9), '#ffffff');
  assert.equal(ballCss(-1), '#ffffff');
  assert.equal(ballCss(NaN), '#ffffff');
  for (let c = 0; c < PARTICLE_RGB.length; c++) assert.equal(ballCss(c), '#' + PARTICLE_RGB[c].toString(16).padStart(6, '0'));
});

test('main.js: « +N » in the ball colour, COMBO x{depth} on a reaction, BONUS … SAUT without amount, ENCHAÎNEMENT x{chain} — pack strings first', () => {
  const main = read('.compiled/main.js');
  const destroy = caseBlock(main, 'destroy');
  assert.doesNotMatch(destroy, /ENCHAÎNEMENT/, 'the reaction is a COMBO, not a chain');
  assert.match(destroy, /this\.strings\?\.COMBO \?\? 'COMBO'/, 'COMBO from strings.json');
  assert.match(destroy, /x\$\{depth\}/, 'COMBO x{depth}');
  assert.match(destroy, /ballCss\(/, '« +N » in the ball colour');
  assert.match(destroy, /\+\$\{e\.points\}/, 'the amount is the match total');
  const gap = caseBlock(main, 'gap');
  assert.match(gap, /GAP_BONUS/);
  assert.match(gap, /DOUBLE_GAP_BONUS/);
  assert.match(gap, /TRIPLE_GAP_BONUS/);
  assert.doesNotMatch(gap, /\+\$\{/, 'no amount in the gap text (it is in the « +N »)');
  assert.match(gap, /BONUS SAUT/, 'fallback without the pack');
  const streak = caseBlock(main, 'streak');
  assert.match(streak, /CHAIN_BONUS/);
  assert.match(streak, /x\$\{/, 'ENCHAÎNEMENT x{chain}');
  assert.doesNotMatch(streak, /COMBO/, 'consecutive hits are a chain, not a combo');
});

// ---------------------------------------------------------------- STATS D-20 (U23)
import { STATS_LAYOUT, statsRows, statsValues, layoutTip, formatSeconds } from '../.compiled/statsdialog.js';
import { normalizeGlyphAlpha } from '../.compiled/bitmapfont.js';

test('statsRows: the right column sits on the left grid — TEMPS / POINTS, OBJECTIF / COMBOS, rule on PIÈCES, BONUS / SAUTS, RECORD / ENCH. MAX. (D-20)', () => {
  for (const lh of [16, 18, 19, 20]) {
    const r = statsRows(lh, 219);
    assert.deepEqual(r.left, Array.from({ length: 6 }, (_, i) => Math.round(219 + i * lh)), `left rows for ${lh}`);
    assert.equal(r.right.time, r.left[0], `TEMPS on POINTS (${lh})`);
    assert.equal(r.right.objective, r.left[1], `OBJECTIF on COMBOS (${lh})`);
    assert.ok(r.left[1] < r.right.rule && r.right.rule < r.left[3], `rule between COMBOS and SAUTS (${lh}: ${r.right.rule})`);
    assert.equal(r.right.rule, r.left[2] - Math.round(0.35 * lh), 'rule in the middle of the PIÈCES row');
    assert.equal(r.right.bonus, r.left[3], `BONUS on SAUTS (${lh})`);
    assert.equal(r.right.record, r.left[4], `RECORD on ENCH. MAX. (${lh})`);
    assert.ok(r.right.record <= r.left[5]);
    for (const y of [...r.left, r.right.record]) assert.ok(y < STATS_LAYOUT.tip.box.y, `rows above the tip box (lh ${lh}: ${y})`);
  }
  assert.equal(statsRows(19, 200).right.time, 200);
  // Research 02 Q4: right labels at x0 + 200, values right-aligned inside their column (hypothesis B3), 18 ≤ lh ≤ 20.
  assert.equal(STATS_LAYOUT.right.labelX - STATS_LAYOUT.left.labelX, 200);
  assert.ok(STATS_LAYOUT.left.valueRight <= STATS_LAYOUT.left.labelX + 180);
  assert.ok(STATS_LAYOUT.right.valueRight <= STATS_LAYOUT.right.labelX + 160);
});

test('one time formatter: TEMPS, OBJECTIF and RECORD all go through formatSeconds (« N s » under a minute, « m:ss » beyond)', () => {
  const v = statsValues({ levelScore: 0, combos: 0, coins: 0, gaps: 0, maxStreak: 0, maxCombo: 0, seconds: 34, parTime: 60, timeBonus: 0, won: true, bestSeconds: 130, noBonusLabel: 'PAS DE BONUS' });
  assert.equal(v.time, '34 s');
  assert.equal(v.objective, '1:00');
  assert.equal(v.record, '2:10');
  assert.equal(formatSeconds(60), '1:00');
  assert.equal(formatSeconds(59.6), '1:00', 'rounded');
  assert.equal(formatSeconds(59.4), '59 s');
  assert.equal(formatSeconds(130), '2:10');
  const dialog = read('.compiled/statsdialog.js');
  assert.equal((dialog.match(/padStart\(2, '0'\)/g) || []).length, 1, 'one m:ss formatter in statsdialog.js');
  assert.doesNotMatch(read('.compiled/main.js'), /padStart/, 'main.js formats no time of its own');
});

test('layoutTip: two lines at most, smaller font before the ellipsis, &cr; is a space, empty text → no line', () => {
  const words = n => Array.from({ length: n }, (_, i) => `mot${i % 7}`).join(' ');
  const measure = s => 6 * s.length;
  const short = layoutTip(words(8), 270, measure, null);
  assert.equal(short.lines.length, 1);
  assert.equal(short.small, false);
  const medium = layoutTip(words(16), 270, measure, null); // 79 characters
  assert.equal(medium.lines.length, 2);
  assert.equal(medium.small, false);
  assert.ok(!medium.lines[1].endsWith('…'), 'fits: no ellipsis');
  const long = layoutTip(words(40), 270, measure, null); // 199 characters
  assert.equal(long.lines.length, 2, 'never more than two lines');
  assert.ok(long.lines[1].endsWith('…'), 'second line ellipsised');
  for (const line of long.lines) assert.ok(measure(line) <= 270, `line fits (${line})`);
  assert.equal(long.small, false, 'no small font available');
  const smallMeasure = s => 4 * s.length;
  const reduced = layoutTip(words(40), 270, measure, smallMeasure);
  assert.equal(reduced.lines.length, 2);
  assert.equal(reduced.small, true, 'smaller font tried first');
  for (const line of reduced.lines) assert.ok(smallMeasure(line) <= 270, `small line fits (${line})`);
  const fitsSmall = layoutTip(words(24), 270, measure, smallMeasure); // 119 characters: 3 lines in the text font, 2 in the small one
  assert.equal(fitsSmall.lines.length, 2);
  assert.equal(fitsSmall.small, true);
  assert.ok(!fitsSmall.lines[1].endsWith('…'), 'no ellipsis when the small font fits');
  assert.deepEqual(layoutTip('Un&cr;deux', 270, measure, null).lines, ['Un deux']);
  assert.deepEqual(layoutTip('', 270, measure, null), { lines: [], small: false });
  assert.deepEqual(layoutTip('   ', 270, measure, null).lines, []);
});

test('normalizeGlyphAlpha: a glyph whose alpha peaks under 255 is raised proportionally, per rect; full and empty glyphs and pixels outside the rects stay', () => {
  // 12 × 4 RGBA picture: rect A (x 0..3) peaks at 128, rect B (x 4..7) is already solid, rect C (x 8..9) is empty, x 10..11 belongs to no rect.
  const w = 12, h = 4;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const alpha = (x, y, a) => { data[(y * w + x) * 4 + 3] = a; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha(x, y, 0);
  alpha(1, 1, 128); alpha(2, 1, 64); alpha(1, 2, 32);
  alpha(5, 1, 255); alpha(6, 1, 100);
  alpha(10, 1, 128); alpha(11, 2, 64);
  const rects = [{ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 }, { x: 8, y: 0, w: 2, h: 4 }];
  const before = Array.from(data);
  normalizeGlyphAlpha(data, w, rects);
  const at = (x, y) => data[(y * w + x) * 4 + 3];
  assert.equal(at(1, 1), 255, 'peak raised to 255');
  assert.equal(at(2, 1), 128, '64 → 128 (× 255 / 128, rounded)');
  assert.equal(at(1, 2), 64, '32 → 64');
  assert.equal(at(0, 0), 0, 'transparent stays transparent');
  assert.equal(at(5, 1), 255, 'solid glyph unchanged');
  assert.equal(at(6, 1), 100, 'solid glyph unchanged (other pixels)');
  assert.equal(at(8, 1), 0, 'empty glyph stays empty');
  assert.equal(at(10, 1), 128, 'outside the rects: unchanged');
  assert.equal(at(11, 2), 64);
  for (let i = 0; i < data.length; i++) if (i % 4 !== 3) assert.equal(data[i], before[i], 'colour channels untouched');
  // Idempotent, and robust to a rect reaching outside the picture.
  const again = Array.from(data);
  normalizeGlyphAlpha(data, w, [...rects, { x: 10, y: 2, w: 10, h: 10 }]);
  assert.deepEqual(Array.from(data).slice(0, 10 * 4), again.slice(0, 10 * 4));
  assert.equal(at(11, 2), 255, 'the partial rect normalises what it covers');
});

test('statsdialog.js: the tip is laid out by layoutTip, left-aligned after « ASTUCE : », on two lines at most; the mask alpha is normalised per glyph', () => {
  const dialog = read('.compiled/statsdialog.js');
  const start = dialog.indexOf('insetBox(ctx, L.tip.box)');
  assert.ok(start > 0, 'tip block compiled');
  const block = dialog.slice(start, dialog.indexOf('kit.button', start));
  assert.match(block, /layoutTip\(/);
  assert.match(block, /align: 'left'/);
  assert.doesNotMatch(block, /align: 'center'/, 'tip lines are not centred any more');
  assert.match(block, /tipSmall/, 'smaller font available to layoutTip');
  assert.match(dialog, /maxLines: 2/);
  assert.equal(STATS_LAYOUT.tip.maxLines, 2);
  assert.equal(STATS_LAYOUT.tip.align, 'left');
  assert.equal(STATS_LAYOUT.tip.x, undefined, 'no centred x any more');
  assert.ok(STATS_LAYOUT.tip.gap > 0, 'gap after the label');
  const font = read('.compiled/bitmapfont.js');
  assert.match(font, /export function normalizeGlyphAlpha\(/);
  const lum = font.slice(font.indexOf('function luminanceToAlpha('), font.indexOf('function multipliedAtlas('));
  assert.match(lum, /normalizeGlyphAlpha\(/, 'applied when the mask becomes an alpha picture');
});
