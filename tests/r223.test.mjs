// R2.0.23 — correctifs « boules qui apparaissent subitement » (session de débogage balls-appear-suddenly).
// The rules are locked by r223-appear; this file locks the baseline itself: ENGINE_VERSION and package.json agree on
// 2.0.23 (r213 keeps the equality rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION } from '../.compiled/core.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// R2.0.24: r224 locks '2.0.24'; this one only checks that the baseline moved past 2.0.23 and still agrees with the package.
test('baseline 2.0.23 superseded: ENGINE_VERSION is newer and agrees with package.json', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(ENGINE_VERSION > '2.0.23', ENGINE_VERSION);
  assert.equal(pkg.version, ENGINE_VERSION);
  assert.match(pkg.description, new RegExp(`^Zuma R${ENGINE_VERSION.replaceAll('.', '\\.')} `));
});
