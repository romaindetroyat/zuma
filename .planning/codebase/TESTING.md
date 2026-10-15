# Testing

**Analysis Date:** 2026-10-10

## Framework

- `node --test` (Node 22) avec `node:assert/strict`
- Commande : `npm test` = build → `node --test "tests/*.test.mjs"` → `node tools/guard.mjs`
- Typecheck : `npm run check` (`tsc --noEmit`)

## Structure

- `tests/r206.test.mjs` : intégrité d'insertion, retrait dû, couleur de projectile (baseline R2.0.7)
- `tests/r211.test.mjs` : 4 power-ups, sons dédiés, STATS monolithique (baseline R2.0.11)
- `tests/r213.test.mjs` : piste, insertion, destruction 40 ticks, réaction en chaîne, recul, bonus saut, munitions, flux, défaite, victoire, power-ups, dual, swap, feedback, niveaux procéduraux, décodeur CURV, mapping sons, shell PWA + garde-fou
- Les tests importent `.compiled/*.js` : toujours builder avant (`npm test` le fait)

## Fixtures

- `engine.loadFixture({balls:[{color,s}], current, next, stream:false})` : chaîne déterministe sur piste droite `[[0,240],[640,240]]`, grenouille `(320,400)`
- Config « silencieuse » : `speed:0, feedSpeed:0, powerChance:0, target:99999`
- `activatePowerForTest(power, index)` pour déclencher un power-up sans tir

## Manual / visual checks

- Playwright (installation globale hors dépôt) : captures de `dist/` servi par `tools/serve.mjs` ; vérifier HUD, sprites, panneau STATS
- Checklist manuelle : tir, échange (clic droit/Espace), pause, menu, STATS, perte de vie, mode ZUMA, victoire

## Coverage gaps

- Pas de test du rendu canvas ni de `main.ts` (flux de niveaux, panneaux)
- Pas de test de `original.ts` (composition alpha) hors navigateur
- Pas de test de `configFromSettings` sur les réglages originaux

---

*Testing analysis: 2026-10-10*
