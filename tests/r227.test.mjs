// R2.0.27 — zone lente du tronçon arrière, brèches exactement comme l'original (projectile à 100 Hz).
// The rules are locked by r227-slowzone and r227-gaps; this file locks the baseline itself: ENGINE_VERSION and
// package.json agree on 2.0.27 (r213 keeps the equality rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION } from '../.compiled/core.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('baseline 2.0.27: ENGINE_VERSION and package.json agree', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(ENGINE_VERSION, '2.0.27');
  assert.equal(pkg.version, '2.0.27');
  assert.match(pkg.description, /^Zuma R2\.0\.27 — /);
});
