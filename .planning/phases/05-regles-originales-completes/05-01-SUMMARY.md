---
phase: 05-regles-originales-completes
plan: 01
subsystem: assets
tags: [bitmap-font, popcap, importer, guard, strings, sounds, tdd]
requires: []
provides:
  - "src/bitmapfont.ts : parseFontScript, layoutText, measureText, fontMetrics, BitmapFont, loadBitmapFont (FontPack structural type)"
  - "pack.json.fonts (5 polices : script UTF-8, image | null, mask), pack.json.strings → strings.json (215 chaînes)"
  - "SOUND_MAP coinappear / coinvanish / pop (40 sons)"
  - "tools/guard.mjs : BANNED exporté, fonts/*.gif|txt refusés"
affects: [05-03 (STATS natif), 05-04 (textes de jeu GET_READY / GO)]
tech-stack:
  added: []
  patterns: ["fonctions pures sans DOM testées en Node sur .compiled/, rendu canvas isolé dans BitmapFont.draw", "atlas teinté par couleur mis en cache (Map<tint, canvas>) pour les polices masque-seul"]
key-files:
  created: [src/bitmapfont.ts, tests/r215-font.test.mjs, tests/r215-import.test.mjs]
  modified: [tools/import-original.mjs, tools/build.mjs, tools/guard.mjs]
decisions:
  - "importOriginal accepte une option `fonts` (défaut FONTS) pour que le test synthétique importe Foo12/Bar18 sans toucher à la liste officielle"
  - "strings.json conserve &cr; et &nbsp; tels quels (aucune entité XML standard dans default.xml)"
  - "BitmapFont.images est indexé par stem d'image de couche ; loadBitmapFont compose image+masque une fois (colour) ou passe le masque (maskOnly)"
  - "guard.mjs : exécution CLI isolée derrière import.meta.url === argv[1] pour être importable par les tests"
metrics:
  duration: "~12 min"
  completed: 2026-10-10
---

# Phase 5 Plan 01: Polices bitmap PopCap, chaînes et sons dans le pack Summary

Parseur/mise en page des polices PopCap (`.txt` + `.gif`/`_.gif`) en fonctions pures verrouillées par Node, rendu canvas avec teinte et ombres, et importateur étendu (5 polices UTF-8, 215 chaînes de `default.xml`, 3 sons) avec garde de publication couvrant `fonts/`.

## Tasks

| # | Tâche | Commits | Fichiers |
|---|-------|---------|----------|
| 1 | Parseur et mise en page des polices PopCap (TDD) | `297dd67` (RED), `82a2351` (GREEN) | src/bitmapfont.ts, tests/r215-font.test.mjs |
| 2 | Importateur — polices, chaînes, sons, garde et MIME (TDD) | `8af78f9` (RED), `9d3d727` (GREEN) | tools/import-original.mjs, tools/build.mjs, tools/guard.mjs, tests/r215-import.test.mjs |
| 3 | `loadBitmapFont` + vérification navigateur | (inclus dans `82a2351`, vérification sans changement de code) | src/bitmapfont.ts |

## What was built

- **`src/bitmapfont.ts`** — tokenisation par expression régulière (identifiants, entiers/décimaux signés, chaînes `'x'` / `"x"` avec `\\` échappé et caractères latin1 acceptés, ponctuation), découpage en directives terminées par `;`, `Define` → listes de valeurs (caractères, nombres, tuples), `CreateLayer` + `LayerSet*` (image, ascent, widths y compris la forme inline `(' ') (5)`, kerning, image map, offsets, offset de couche, colorMult, baseOrder, padding/point size), `SetCharMap`, `SetDefaultPointSize`. Directives inconnues (`LayerRequireTags`) ignorées. Couches triées stablement par `baseOrder`. `layoutText` pose les glyphes couche par couche (stylo par couche, crénage avant le glyphe, `dx = pen + offsets.x + layer.offset.x`, `dy = −ascent + offsets.y + layer.offset.y`), les espaces avancent sans glyphe, les caractères inconnus sont ignorés. `fontMetrics` donne ascent/hauteur de la police. `BitmapFont.draw` : police couleur dessinée telle quelle (composée une fois dans `loadBitmapFont` via `applyMask`), police masque-seul teintée via un atlas par couleur (luminance → alpha puis `destination-in`), couche `colorMult` dessinée depuis un atlas multiplié (`multiply` + `destination-in`) avec `globalAlpha × a` ; `align` left/center/right ; retourne la largeur. `loadBitmapFont(pack, key)` lit `pack.data.fonts[key]`, `fetch` du script, images via `pack.image(path)`, `null` dès qu'un élément manque (type structurel `FontPack`, `original.ts` non modifié).
- **Importateur** — `FONTS` exporté ; `fonts/<stem>.txt` réécrit en UTF-8 (`readText` latin1), `<stem>.gif` et `_<stem>.gif` copiés ; `pack.fonts[stem] = { script, image | null, mask | null }` ; `properties/default.xml` (UTF-16 LE BOM) → `strings.json` (préfixe `STRING_ID_` retiré, `DIALOG_BUTTON_OK` conservé, `&cr;` intact) ; `SOUND_MAP` + `coinappear`, `coinvanish`, `pop`. Log : `22 levels, 25 curves, 40 sounds, 40 m4a, 77 images, 5 fonts, 215 strings`.
- **build.mjs** — `bitmapfont` dans `MODULES` après `original` ; `.txt` inliné en `text/plain;charset=utf-8` (vérifié dans `standalone/zuma-standalone.html`).
- **guard.mjs** — `BANNED` exporté, regex étendue à `fonts/` et `.txt`, fonction `guard()` retournant le code de sortie, CLI derrière le test `import.meta.url`.

## Verification

- `npm test` : 85/85 verts (dont r215-font 6 tests, r215-import 4 tests, r214-import inchangé), garde : 472 fichiers suivis, aucun propriétaire.
- `npm run check` : tsc exit 0.
- `node tools/import-original.mjs` → 5 polices, 215 chaînes, 40 sons ; les 16 clés attendues (STATS … GO) présentes.
- Parsing réel des 5 scripts originaux : Cancun12 (Shadow/Main, ascent 17, A = 11 px, rect {0,0,10,21}), NativeAlienExtended18 (charMap 7, espace 12, padding 4), Cancun10 (2 ombres, 148 paires de crénage dont `"A`, charMap minuscules → majuscules), Arial12Bold, CancunFloat14.
- Navigateur (Playwright/Chromium, `dist/` local) : `loadBitmapFont` sur `cancun12` (maskOnly) et `nativealienextended18` (couleur) ; « STATISTIQUES » = 4922 px opaques, « PIÈCES 12 » teinté `#f5d65b` = 619 px opaques avec ombre ; police inconnue → `null`. Capture : `/tmp/claude-0/-home-user-zuma/10af772b-439d-52df-b16e-f3c5e1ea6b00/scratchpad/shots-r215/font-smoke.png` (hors dépôt).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Option `fonts` sur `importOriginal`**
- **Found during:** Task 2
- **Issue:** le comportement attendu (`pack.fonts.foo12` sur un arbre synthétique) est incompatible avec une liste `FONTS` fixe sans point d'entrée.
- **Fix:** `importOriginal(src, out, { fonts })` avec `fonts = FONTS` par défaut ; le CLI et le pack réel restent identiques.
- **Files modified:** tools/import-original.mjs
- **Commit:** `9d3d727`

**2. [Rule 1 - Test] Assertion `pack.sounds` corrigée**
- **Found during:** Task 2 (GREEN)
- **Issue:** `pop.ogg` sert deux clés (`swap` et `pop`) : `pack.sounds` vaut `['swap', 'pop']`, pas `['pop']`.
- **Fix:** attente corrigée dans le test, comportement de l'importateur inchangé.
- **Commit:** `9d3d727`

**3. Task 3 fusionnée dans Task 1**
- `loadBitmapFont` et le type structurel `FontPack` ont été écrits avec le module (commit `82a2351`) ; Task 3 s'est réduite à la vérification navigateur, sans commit supplémentaire.

## Observations for 05-03 / 05-04

- `NativeAlienExtended18.gif` est nativement beige-pierre (couleur dominante RGB 190,185,162), pas doré : le « titre doré » de D-02 exigera soit une option de multiplication de couleur sur une police couleur (`DrawOptions`), soit l'acceptation de la teinte d'origine du gif. `BitmapFont.draw` ignore `tint` pour les polices couleur comme spécifié.
- `STRING_ID_MAX_CHAIN` = « ENCH. MAX. » existe : D-03 n'a pas besoin d'abréger CHAIN_BONUS.
- `tools/serve.mjs` sert `.txt` en `application/octet-stream` ; `fetch().text()` décode en UTF-8 quoi qu'il en soit, aucun changement nécessaire.
- Le bloc `extra/` + `stats_layout.json` de l'importateur est laissé en place (retrait prévu en 05-03 avec ses consommateurs).

## Known Stubs

None.

## Threat Flags

None — surfaces conformes au registre : parseur sans évaluation dynamique, `drawImage` borné par l'image, garde étendue à `fonts/`.

## Self-Check: PASSED

- FOUND: src/bitmapfont.ts, tests/r215-font.test.mjs, tests/r215-import.test.mjs, tools/import-original.mjs, tools/build.mjs, tools/guard.mjs
- FOUND commits: 297dd67, 82a2351, 8af78f9, 9d3d727
