// R2.0.26 — aucun son en retard : sons annulés sur une horloge arrêtée, retard de sortie mesuré, contexte reconstruit.
// The rules are locked by r226-audio-lag; this file locks the baseline itself: ENGINE_VERSION and package.json agree
// on 2.0.26 (r213 keeps the equality rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION } from '../.compiled/core.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('baseline 2.0.26: ENGINE_VERSION and package.json agree', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(ENGINE_VERSION, '2.0.26');
  assert.equal(pkg.version, '2.0.26');
  assert.match(pkg.description, /^Zuma R2\.0\.26 — /);
});
