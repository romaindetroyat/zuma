# Architecture

**Analysis Date:** 2026-10-10

## Pattern Overview

**Overall:** Simulation déterministe à pas fixe + couche de présentation séparée.

**Key Characteristics:**
- `ZumaEngine` (src/core.ts) ne touche jamais au DOM ; il consomme des commandes et émet des événements
- La présentation (`render.ts`, `audio.ts`, `main.ts`) draine `engine.drainEvents()` à chaque tick et traduit en sons/particules/textes via `feedback.ts`
- Deux sources de niveaux interchangeables : pack original (`original.ts`) ou procédural (`levels.ts`)

## Layers

**Simulation (src/core.ts):**
- Purpose: règles du jeu, physique de chaîne, power-ups, score, états de fin
- Contains: `SeededRandom`, `Track`, `Chain`, `ZumaEngine`, `CANDIDATE` (config), types `Ball`/`Projectile`/`Removal`/`GameEvent`
- Depends on: rien
- Used by: tests, `main.ts`, `render.ts`

**Feedback (src/feedback.ts):**
- Purpose: règles de présentation déterministes (sons par événement, trames d'explosion, particules)
- Depends on: `core.ts` (`SeededRandom`, `GameEvent`)

**Assets (src/original.ts, src/audio.ts):**
- Purpose: chargement du pack privé, composition masque alpha PopCap (`_name.gif`), feuilles de sprites, sons
- Depends on: `core.ts` (`Track`, `Point`), `feedback.ts` (`SoundCue`)

**Rendering (src/render.ts):**
- Purpose: dessin canvas 640×480 (fond, trous, chaînes, projectiles, découpes, grenouille, effets, HUD) en mode sprites ou vectoriel
- Depends on: `core.ts`, `feedback.ts`, `original.ts` (types)

**Application (src/main.ts):**
- Purpose: cycle de vie (nouvelle partie, niveau suivant, réessai), boucle rAF à accumulateur, entrées, panneaux DOM, mapping des réglages originaux (`configFromSettings`), enregistrement du service worker

## Data Flow

**Tick:**
1. `main.ts` pousse `command({kind:'aim'|'shoot'|'swap'})`
2. `engine.step()` : commandes → compteurs power-ups → spawn par chaîne → `moveChain` (recul, poussoir, attraction, résolution avant, jonctions) → projectiles (collision, insertion, bonus saut, détection de run) → retraits dus → apparition de power-up → états de fin
3. `drainEvents()` → `soundCues()` + effets + messages HUD
4. `renderer.draw(engine, fx, hud, frame)`

**Niveau:**
- Pack présent : `stages[stage].levels[i]` + `settings` → `configFromSettings` → `ZumaEngine(tracks[], frog, config, seed)`
- Sinon : `levelFor(index)` → `new Track(def.track)`

## Key Abstractions

**Track:** polyligne paramétrée par abscisse curviligne `s` ; `pointAt`, `tangentAt`, `nearest`, `layerAt` (drapeaux tunnel)
**Chain:** billes d'une piste (ordre arrière→avant, `s` croissant) + retraits + reculs + compteur de spawn
**Removal:** retrait logique différé (`due = tick + destroyTicks`) ; seules les billes marquées `destroyingUntil` sont supprimées
**GameEvent:** `{tick, kind, ...}` ; `kind` ∈ fire, insert, merge, swap, destroy, gap, streak, zuma, lost, won, gameover, power-spawn, power-activate, power-bomb, recolor, miss

## Entry Points

- `index.html` → `js/main.js` (module) → `new Game().start()`
- Tests : `tests/*.test.mjs` importent `.compiled/*.js`
- Outils : `tools/build.mjs`, `tools/import-original.mjs`, `tools/guard.mjs`, `tools/serve.mjs`

## Error Handling

- Chargements d'assets tolérants (retour `null`, repli procédural/synthèse)
- `localStorage` et `AudioContext` protégés
- Le moteur lève uniquement sur usage incorrect (piste vide, index de fixture invalide)

## Cross-Cutting Concerns

**Determinism:** un seul `SeededRandom` de simulation ; la présentation ne le consomme jamais (`makeColorBurst` a son propre générateur)
**Units:** vitesses de chaîne en px/s, projectile en px/tick, durées en ticks à 60 Hz ; réglages originaux (100 Hz) convertis dans `configFromSettings`

---

*Architecture analysis: 2026-10-10*
