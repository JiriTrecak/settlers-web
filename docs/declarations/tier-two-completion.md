# Ant Tier 2 completion audit

Completed 2026-09-10 against simulation build `declarative-sim-22` and content
fingerprint `a21f6d1d`. This audit supersedes pending-work statements in the
chronological implementation checkpoints.

## Rules and native systems

- Mound/Great Mound: authored upgrade, three-resource costs, same identity,
  prerequisites, progress, canceled-purchase refunds, interrupted births and
  persistence are covered by `building-upgrades.test.ts`, `great-mound.test.ts`
  and the continuous `tier-two-progression.test.ts` in `tests/game`.
- Root: finite 3,000-unit deposits, five gatherers, ten per carry, physical
  Rootworks-only delivery and shared spendable currency are declared in
  `content/game.json`. `specialized-dropoff.test.ts` verifies no Mound
  substitution, capacity, depletion/partial final cargo, saved gathering and
  currency surviving outpost loss. Native cargo inspection confirmed ten Root
  in the Worker before balance credit. Mineral collision behavior uses the
  existing shared gathering rule.
- Hunter: real Barracks Worker conversion, Great Mound gate, Amber/Wood-only
  bill, path-respecting charge, one impact bonus, cooldown research,
  interruption and deterministic restore are covered by `hunter.test.ts`.
- Bombardier: Workshop gate/construction, physical recruitment and Root refund
  are covered by `bombardier.test.ts` and the continuous progression test.
  `shells.test.ts` covers windup, immutable non-homing flight, delayed area
  damage, dodging, shooter loss, visibility, strongest-only slow, cancellation,
  research and deterministic mid-flight restore. `shell-effects.test.ts` checks
  exported animated muzzle placement and trajectory independence.
- Ironroot Forge: paid colony-wide research, duplicate rejection, cancellation,
  persistent knowledge, existing/future units, wounded HP, hero revival and
  material effects are covered by `research.test.ts` and
  `ironroot-forge.test.ts`. The roster includes all requested current Ant units.

## Complete progression and integration

The continuous progression regression builds Rootworks, gathers 240 Root from
zero, builds Barracks/Forge, upgrades the Mound, builds Workshop, converts two
Worker IDs to Hunter/Bombardier, buys Driving Spear/Saturating Shells and restores
while fighting. Original and restored states remain identical. Ordinary economy
funding is fixture setup; advanced units, Root and completed upgrades are not
injected in this progression test.

Actual native HUD inspections cover currencies, prerequisite locks, upgrade
replacement, research admission/cancellation, Root occupancy/cargo, Hunter duel,
Bombardier selection/stats/commands and Workshop selection/production lock.
Workshop inspection shows 1,400/1,400 HP and armor 5 with the published model.
Editor and HUD consume the same definitions/assets; generated wiki has 131 pages,
58 definitions and five map entries. Existing save and lockstep checks pass.

Each playable battle map has two guarded contested deposits. Native map tests
check finite resource/capacity, camp hostility, distance from starts, paths for
both players and legal nearby Rootworks placement. All eight sites were
visually inspected in the native renderer. AI tests and recorded contested duels
prove Rootworks/Great Mound progression, Workshop production and shell use;
continued duels recruited Hunters for both AI players. Reports are retained in
`experiments/ai` and described in `tier-two.md`.

## Assets and editable delivery

All seven source folders include configured Blender source, deterministic recipe,
reference, sampled palette, comparison and per-asset delivery report. Earlier
Blender/GLB/orbit/color/animation inspections remain documented in those reports.
The muzzle refinement was rebuilt and revalidated; published Bombardier export
matches its studio variant. Team surfaces use exactly `TC_TeamColor`.

- Great Mound: 58,902 triangles; studio http://127.0.0.1:8814/
- Rootworks: 11,004 triangles; studio http://127.0.0.1:8811/
- Corrupted Root: 8,106 triangles; carried bundle 114; studio http://127.0.0.1:8813/
- Ironroot Forge: 11,684 triangles; studio http://127.0.0.1:8812/
- Bombardier Workshop: 17,594 triangles; studio http://127.0.0.1:8795/
- Hunter: 4,328 triangles; studio http://127.0.0.1:8815/
- Bombardier: 5,008 triangles; studio http://127.0.0.1:8806/

All studio identities and served GLBs were checked. Sources live under
`art/sources/buildings` or `art/sources/characters`; game exports
live under `assets/ant-colony`. Player ants have native rigs, distinct movement
and combat clips, independent ownership colors and death playback. Buildings
retain their static material/style simplifications described in their reports.

## Runtime and performance evidence

Full regression suite: **483 tests in 124 files passed**. Production build,
TypeScript, wiki generation and whitespace checks pass. Vite retains existing
large-chunk/config warnings.

The fixed-site renderer held 120 FPS. The native 32-troop battle at 2560×1440
soft shadows averaged 109.8 FPS and fired 66 shells; its report explicitly
excludes HUD/minimap. Full-session checks then used the normal Session, transport,
AI, HUD, minimap and fog at 2326×2408 / 2 DPR. Starting-base inspection showed
120 FPS. The injected diagnostic Tier 2 battle showed 119 FPS with selected
Bombardier HUD; a later revealed view showed 118 FPS. During the battle sample,
GPU mean/p95 was 4.08/5.12ms; whole app CPU mean/p95 was 5.42/11.00ms. Later
revealed terrain was more expensive, GPU 5.79/7.56ms and app CPU 7.38/14.70ms.
These are observed rolling samples, not a guarantee for arbitrary armies,
cameras or hardware. No claim of a universal sustained 120 FPS floor is made.

The diagnostic full-session workload is prepared with
`scripts/ai/prepare-render-battle.ts` from a temporary local save, and validated
through World.restore before the gameLoad API accepts it. It changes neither
authored maps nor user save files. The gameplay progression proof remains the
separate non-injected regression above.

## Known limits, not missing Tier 2 features

Balance values are an initial playtest baseline. Art uses broad geometry and
simplified surface detail. Studios require their managed local servers to remain
running. Performance varies with scene/camera and is not guaranteed at 120 FPS.
Future balance tuning, additional factions and further general optimization are
outside this completed Tier 2 implementation pass.
