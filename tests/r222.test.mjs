// R2.0.22 — baseline des records partagés (phase 6.1).
// The hosted build shares the adventure high scores and the best level times through api/records (zuma-scores,
// SCORES_DB); the rules are locked by r222-records, r222-api, r222-deploy, r222-display and r222-wiring. This file
// locks the baseline itself: ENGINE_VERSION and package.json agree on 2.0.22 (r213 keeps the equality rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION } from '../.compiled/core.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('baseline 2.0.22: ENGINE_VERSION and package.json agree', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(ENGINE_VERSION, '2.0.22');
  assert.equal(pkg.version, '2.0.22');
  assert.match(pkg.description, /^Zuma R2\.0\.22 — /);
});
