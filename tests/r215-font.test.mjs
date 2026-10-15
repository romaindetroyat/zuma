import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFontScript, layoutText, measureText } from '../.compiled/bitmapfont.js';

/**
 * R2.0.15 — PopCap bitmap font scripts: the parser must read the `.txt` grammar
 * (Define lists, CreateLayer, LayerSet*, SetCharMap, SetDefaultPointSize) and the
 * layout must honour widths, kerning, per-glyph offsets, the char map and the
 * shadow layer (offset, colour multiplier, base order).
 */
function syntheticScript({ charMap = false } = {}) {
  return [
    `Define CharList ('A', "'", '\\\\');`,
    'Define WidthList (10, 4, 6);',
    'Define RectList ((0, 0, 9, 12), (10, 0, 3, 12), (14, 0, 5, 14));',
    'Define OffsetList ((0, 0), (1, -1), (0, 2));',
    `Define KerningPairs ("A'");`,
    'Define KerningValues (-2);',
    '',
    'CreateLayer               Main;',
    "LayerSetImage             Main 'Foo';",
    'LayerSetAscent            Main 10;',
    'LayerSetCharWidths        Main CharList WidthList;',
    "LayerSetCharWidths        Main (' ') (5);",
    'LayerSetKerningPairs      Main KerningPairs KerningValues;',
    'LayerSetImageMap          Main CharList RectList;',
    'LayerSetCharOffsets       Main CharList OffsetList;',
    'LayerSetAscentPadding     Main 0;',
    'LayerSetLineSpacingOffset Main 0;',
    'LayerSetPointSize         Main 11;',
    '',
    'CreateLayer               Shadow;',
    "LayerSetImage             Shadow 'Foo';",
    'LayerSetAscent            Shadow 10;',
    'LayerSetCharWidths        Shadow CharList WidthList;',
    "LayerSetCharWidths        Shadow (' ') (5);",
    'LayerSetKerningPairs      Shadow KerningPairs KerningValues;',
    'LayerSetImageMap          Shadow CharList RectList;',
    'LayerSetCharOffsets       Shadow CharList OffsetList;',
    'LayerSetPointSize         Shadow 11;',
    'LayerSetOffset\t\t\t  Shadow (1, -1);',
    'LayerSetColorMult\t\t  Shadow (0, 0, 0, 0.75);',
    'LayerSetBaseOrder\t\t  Shadow -1;',
    'LayerRequireTags\t\t  Shadow ("Shadow");',
    '',
    ...(charMap ? ["Define MapFrom ('A');", `Define MapTo ("'");`, 'SetCharMap MapFrom MapTo;'] : []),
    'SetDefaultPointSize  11;',
    '',
  ].join('\n');
}

test('parseFontScript reads defines, layers, quoting, offsets, colour multiplier and base order', () => {
  const font = parseFontScript(syntheticScript({ charMap: true }));
  assert.equal(font.layers.length, 2);
  assert.deepEqual(font.layers.map(l => l.name), ['Shadow', 'Main'], 'layers sorted by baseOrder (shadow first)');
  const [shadow, main] = font.layers;
  assert.equal(main.image, 'foo');
  assert.equal(main.ascent, 10);
  assert.equal(main.pointSize, 11);
  assert.equal(main.widths.get(' '), 5, 'inline list form of LayerSetCharWidths');
  assert.equal(main.widths.get('A'), 10);
  assert.equal(main.widths.get("'"), 4);
  assert.deepEqual(main.rects.get('\\'), { x: 14, y: 0, w: 5, h: 14 }, 'escaped backslash character');
  assert.deepEqual(main.rects.get("'"), { x: 10, y: 0, w: 3, h: 12 }, 'double-quoted apostrophe character');
  assert.deepEqual(main.offsets.get("'"), { x: 1, y: -1 });
  assert.equal(main.kerning.get("A'"), -2);
  assert.deepEqual(main.offset, { x: 0, y: 0 });
  assert.equal(main.colorMult, null);
  assert.equal(main.baseOrder, 0);
  assert.deepEqual(shadow.offset, { x: 1, y: -1 });
  assert.deepEqual(shadow.colorMult, [0, 0, 0, 0.75]);
  assert.equal(shadow.baseOrder, -1);
  assert.equal(font.charMap.get('A'), "'");
  assert.equal(font.defaultPointSize, 11);
});

test('layoutText advances by widths plus kerning and places glyphs per layer', () => {
  const font = parseFontScript(syntheticScript());
  assert.equal(font.charMap.size, 0);
  const aa = layoutText(font, 'AA');
  assert.equal(aa.width, 20, 'no kerning pair for AA');
  const ak = layoutText(font, "A'");
  assert.equal(ak.width, 10 + 4 - 2, 'kerning A\' = -2');
  assert.equal(ak.ascent, 10);
  assert.equal(ak.height, 10 + Math.max(12 - 10, 12 - 10 - 1, 14 - 10 + 2), 'height = ascent + deepest descent');
  // Shadow glyphs come first (baseOrder -1) and are displaced by (+1, -1).
  const shadowGlyphs = ak.glyphs.filter(g => g.layer === 0);
  const mainGlyphs = ak.glyphs.filter(g => g.layer === 1);
  assert.equal(shadowGlyphs.length, 2);
  assert.equal(mainGlyphs.length, 2);
  assert.ok(ak.glyphs.indexOf(shadowGlyphs[0]) < ak.glyphs.indexOf(mainGlyphs[0]), 'shadow listed before main');
  assert.deepEqual(mainGlyphs.map(g => g.char), ['A', "'"]);
  assert.equal(mainGlyphs[0].dx, 0);
  assert.equal(mainGlyphs[0].dy, -10, 'dy = -ascent + offset.y');
  assert.deepEqual([mainGlyphs[0].sx, mainGlyphs[0].sy, mainGlyphs[0].sw, mainGlyphs[0].sh], [0, 0, 9, 12]);
  assert.equal(mainGlyphs[1].dx, 10 - 2 + 1, 'pen after A, kerned, plus glyph offset x');
  assert.equal(mainGlyphs[1].dy, -10 - 1, 'glyph offset y');
  for (let i = 0; i < 2; i++) {
    assert.equal(shadowGlyphs[i].dx, mainGlyphs[i].dx + 1);
    assert.equal(shadowGlyphs[i].dy, mainGlyphs[i].dy - 1);
  }
});

test('layoutText applies the char map and lets spaces advance without a glyph', () => {
  const font = parseFontScript(syntheticScript({ charMap: true }));
  const mapped = layoutText(font, 'A');
  assert.equal(mapped.width, 4, "A maps to ' (width 4)");
  assert.deepEqual(mapped.glyphs.filter(g => g.layer === 1).map(g => g.char), ["'"]);
  const spaced = layoutText(parseFontScript(syntheticScript()), 'A A');
  assert.equal(spaced.width, 10 + 5 + 10);
  assert.equal(spaced.glyphs.length, 4, 'space produces no glyph on either layer');
  assert.equal(spaced.glyphs.filter(g => g.layer === 1)[1].dx, 15);
});

test('measureText equals the layout width, empty string is 0 and unknown characters are ignored', () => {
  const font = parseFontScript(syntheticScript());
  assert.equal(measureText(font, "A'"), layoutText(font, "A'").width);
  assert.equal(measureText(font, ''), 0);
  assert.equal(layoutText(font, '').glyphs.length, 0);
  assert.equal(measureText(font, 'AéA'), 20, 'unknown character neither advances nor throws');
  assert.equal(layoutText(font, '€').glyphs.length, 0);
});

test('parseFontScript tolerates an empty or directive-less script', () => {
  const font = parseFontScript('');
  assert.deepEqual(font.layers, []);
  assert.equal(measureText(font, 'ABC'), 0);
  assert.equal(parseFontScript('SetDefaultPointSize 9;').defaultPointSize, 9);
});

const REAL = 'private_assets/original/fonts/Cancun12.txt';
test('parseFontScript reads the original Cancun12.txt', { skip: !fs.existsSync(REAL) }, () => {
  const text = fs.readFileSync(REAL).toString('latin1');
  const font = parseFontScript(text);
  const names = font.layers.map(l => l.name);
  assert.deepEqual(names, ['Shadow', 'Main']);
  const main = font.layers[names.indexOf('Main')];
  assert.equal(main.ascent, 17);
  assert.equal(main.image, 'cancun12');
  assert.equal(main.widths.get('A'), 11);
  assert.deepEqual(main.rects.get('A'), { x: 0, y: 0, w: 10, h: 21 });
  assert.ok(main.rects.has('É'), 'latin1 accented characters survive');
  assert.equal(font.defaultPointSize, 11);
  assert.ok(measureText(font, 'STATISTIQUES') > 100);
});
