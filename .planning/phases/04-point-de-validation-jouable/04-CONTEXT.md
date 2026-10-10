# Phase 4: Point de validation jouable - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Corriger les écarts constatés lors de la première session de jeu de l'utilisateur sur R2.0.13 (voir `04-UAT.md`) : fonds de niveau, calques animés, résolution, sons originaux (y compris roulement et alerte), animation d'insertion, recul, placement de la grenouille. Les écrans STATS d'origine (U4) sont hors de cette phase tant que la référence n'est pas fournie.

</domain>

<decisions>
## Implementation Decisions

### Ressources et fonds (U1, U5)
- **D-01:** `tools/import-original.mjs` copie la vignette sous `levels/<id>/thumb.jpg` ; le fond garde `<id>.jpg`. `graphics.thumbnail` pointe vers `thumb.jpg`.
- **D-02:** Le fond est dessiné 1:1 (`drawImage(bg, 0, 0, 640, 480, 0, 0, 640, 480)`), jamais mis à l'échelle ; un fond d'une autre taille est recadré.
- **D-03:** Les `BackgroundAlpha` (overlays) sont dessinés juste après le fond, **sous** les billes, avec une oscillation lente le long de (vx, vy) (amplitude ≤ 3 px). Les `Cutout` (tunnels) restent dessinés au-dessus des billes.

### Résolution (U5)
- **D-04:** Le canvas garde la logique 640×480 mais son backing store suit `devicePixelRatio × échelle CSS` (`ctx.setTransform`) pour un texte et des vecteurs nets ; les sprites restent lissés.
- **D-05:** Option de menu « Pixels nets » (persistée dans `localStorage`, clé `zuma.pixelated`) : échelle entière (×1, ×2, ×3) + `image-rendering: pixelated`.

### Sons (U2, U6)
- **D-06:** L'importateur transcode chaque `.ogg` en `.m4a` (AAC, ffmpeg) à côté de l'`.ogg` quand `ffmpeg` est disponible ; `manifest.json` liste les clés et les formats présents. `AudioManager` choisit le premier format que `canPlayType` accepte.
- **D-07:** Tous les sons du pack sont décodés dès le premier geste utilisateur (`unlock()`), en parallèle ; la synthèse ne sert qu'aux clés absentes du pack.
- **D-08:** Boucle de roulement (`rolling`) jouée tant qu'une chaîne avance, gain proportionnel à la vitesse (0 à l'arrêt, 1 à `feedSpeed`) ; boucle d'alerte (`warning`) quand la bille de tête est à moins de 160 px du crâne (abscisse), coupée en vidange.
- **D-09:** Les événements existants gardent leurs sons (`gap` → gapbonus1, bonus textes). Aucun son ajouté au recul (l'original n'en a pas).

### Insertion animée (U3)
- **D-10:** Nouveau champ `Ball.width` (0..1). `land()` crée la bille avec `width = 0`, `enterFrom = {x, y}` du projectile ; chaque tick `width += 1 / mergeTicks` (`CANDIDATE.mergeTicks = 12`, dérivé de `mergespeed 0.05` à 100 Hz). La contrainte d'espacement devient `spacing × (w[i-1] + w[i]) / 2` dans `resolveForward` / `resolveBackward` / composantes. La détection de run n'a lieu qu'à `width = 1`.
- **D-11:** Le rendu interpole la position de la bille entre `enterFrom` et sa position sur la piste selon `width`, avec un léger grossissement. `insert()` (API de test) reste instantané (`width = 1`).

### Recul (U6)
- **D-12:** La trame de roulement des sprites dérive de `s` ; vérifier que le recul fait tourner les billes en sens inverse et verrouiller par un test (`frameFor(s)` monotone, retour en arrière ⇒ trame décroissante).

### Grenouille (GAME-05)
- **D-13:** Mesurer dans `SMALLFROGonPAD` la position du cercle sombre (écoutille) et de la bouche pour fixer les offsets `front`/`back` ; capture de contrôle.

### Claude's Discretion
- Détails de l'oscillation des overlays, courbe d'ease de l'insertion, volume des boucles.

</decisions>

<specifics>
## Specific Ideas

- Référence de ressenti : Zuma Deluxe original (installeur fourni). Les sons, textes et timings doivent s'y conformer.
- Phrase de l'utilisateur sur l'insertion : « faire leur place dans un mouvement, une animation visible, pas apparaître tout d'un coup ».
- Format attendu pour des graphismes fournis par l'utilisateur (à documenter dans le README) : fond JPG/PNG 640×480 nommé `levels/<id>/<id>.jpg`, découpes PNG avec alpha + position (x, y), tracé = JSON de points `[x, y, flags]` (même format que les courbes importées).

</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/04-point-de-validation-jouable/04-UAT.md` — retours utilisateur et critères de ré-acceptation
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `TESTING.md`
- `private_assets/original/levels/levels.xml` (BackgroundAlpha, Cutout) et `private_assets/pack/pack.json` (hors Git, présents dans cet environnement)

</canonical_refs>

<deferred>
## Deferred to later phases

- U4 écrans STATS d'origine : bloqué en attente du standalone R2.0.12 ou de captures de l'utilisateur
- Pièces bonus, séquences « Attention / PARTEZ », musique : Phases 5 et 7

</deferred>
