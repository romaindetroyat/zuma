# R2.0.11

Validated local build: 38/38 tests pass and publication guard passes.

## Functional power-ups
- Bomb: marks all balls in its blast radius for destruction and emits the bomb explosion event/visual burst.
- Slow: measurably divides forward chain speed by the configured slow factor (default evidence: 4).
- Backwards: all separated chain components move in reverse during the effect window.
- Accuracy: aiming ray is enabled and projectile speed is increased.
- Dedicated original sound resources are dispatched for Bomb, Slow, Backwards and Accuracy.

## STATS
The broken external/background-template dependency is removed. STATS is rendered as one opaque monolithic 640x480-responsive panel with one title, one data layer, one tip and one OK control.

## Preserved regression locks
Stable-ID insertion, no replacement/recolouring, 40-tick destruction persistence, local segment recoil, immutable projectile colour, gap bonus audio sequence, power visibility and ammo colour filtering.

The public repository intentionally excludes proprietary Zuma media, executables, local packs and standalone builds containing those assets.
