# Coding Conventions

**Analysis Date:** 2026-10-10

## Code Style

- TypeScript strict, imports ESM avec extension `.js` (`import ... from './core.js'`)
- Types explicites sur les API publiques ; `readonly` pour les dépendances injectées
- Pas de framework, pas de dépendance runtime : préférer les API navigateur natives
- Commentaires JSDoc courts sur les modules et les règles non évidentes ; langue des commentaires : anglais dans le code, français dans la documentation et l'interface

## Naming

- Classes `PascalCase`, fonctions/variables `camelCase`, constantes de configuration `SCREAMING_CASE` (`CANDIDATE`, `WIDTH`)
- Événements du moteur : `kind` en kebab-case (`power-activate`)
- Paramètres volontairement inutilisés préfixés `_` (`_pos`)

## Patterns

- Moteur sans DOM ; toute interaction via `command()` et `drainEvents()`
- Tout ce qui est aléatoire dans la simulation passe par `engine.rng` ; la présentation utilise des générateurs dérivés (`makeColorBurst`)
- Chargement d'assets : renvoyer `null` et prévoir un repli, jamais lever
- Nouvelles règles de jeu = nouveau test dans `tests/r<version>.test.mjs` + ligne dans les notes de version

## Error Handling

- try/catch autour de `localStorage`, `fetch` du pack, `AudioContext`
- Les outils CLI sortent avec code 1 et message explicite

## Commits & versions

- Baseline = `ENGINE_VERSION` (src/core.ts) == `package.json` version (test `r213`)
- Chaque baseline a `R<xyz>_RELEASE_NOTES.md`
- Ne jamais commiter de média/exécutable/pack issu du jeu original : `npm run guard` et la CI le vérifient

## Localisation

- Interface et textes de jeu en français (alignés sur les chaînes originales : « Balle RALENTIR », « BONUS SAUT », « ENCHAÎNEMENT »)

---

*Conventions analysis: 2026-10-10*
