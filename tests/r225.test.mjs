// R2.0.25 — son sans décalage après une pause (nouveau contexte audio à la reprise).
// The rule is locked by r225-audio-pause; this file locks the baseline itself: ENGINE_VERSION and package.json agree
// on 2.0.25 (r213 keeps the equality rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION } from '../.compiled/core.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('baseline 2.0.25: ENGINE_VERSION and package.json agree', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(ENGINE_VERSION, '2.0.25');
  assert.equal(pkg.version, '2.0.25');
  assert.match(pkg.description, /^Zuma R2\.0\.25 — /);
});
