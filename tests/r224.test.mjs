// R2.0.24 — menus (recommencer, reprise), barème des brèches et enchaînements, cinématique des niveaux.
// The rules are locked by r224-menus, r224-scoring and r224-settings; this file locks the baseline itself:
// ENGINE_VERSION and package.json agree on 2.0.24 (r213 keeps the equality rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION } from '../.compiled/core.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// R2.0.25: r225 locks '2.0.25'; this one only checks that the baseline moved past 2.0.24 and still agrees with the package.
test('baseline 2.0.24 superseded: ENGINE_VERSION is newer and agrees with package.json', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(ENGINE_VERSION > '2.0.24', ENGINE_VERSION);
  assert.equal(pkg.version, ENGINE_VERSION);
  assert.match(pkg.description, new RegExp(`^Zuma R${ENGINE_VERSION.replaceAll('.', '\\.')} `));
});
