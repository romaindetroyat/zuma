// R2.0.28 — records personnels (demande utilisateur).
// The rules are locked by r228-personal-records; this file locks the baseline itself: ENGINE_VERSION and package.json
// agree on 2.0.28 (r213 keeps the equality rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION } from '../.compiled/core.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('baseline 2.0.28: ENGINE_VERSION and package.json agree', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(ENGINE_VERSION, '2.0.28');
  assert.equal(pkg.version, '2.0.28');
  assert.match(pkg.description, /^Zuma R2\.0\.28 — /);
});
