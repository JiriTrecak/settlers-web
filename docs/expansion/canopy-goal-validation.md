# Canopy environment delivery validation

This record covers the outdoor Hollow Gate and indoor Heartwood Vault milestone, including layered navigation, the environment kit and unit cameras. The levels are playable campaign chapters; art direction and final campaign balance can continue evolving.

## Playable levels and progression

- **Hollow Gate:** a 256 × 256 outdoor chapter with dense harvestable woods, water, timber and stone crossings, a raised root, optional encounters and a monumental hollow-stump entrance. Recipe: `scripts/missions/hollow-gate.ts` and its Lua mission.
- **Heartwood Vault:** a 256 × 256 indoor chapter with a hero and company, connected chambers, an elevated root above a lower route, optional fixed loot, a resin wellspring and a final Bitter Heart encounter. Recipe: `scripts/missions/heartwood-vault.ts` and its Lua mission.
- `tests/game/canopy-journey.test.ts` completes both chapters through ordinary movement, combat, abilities and item use. It skips dialogue presentation delays, without teleporting the party, granting combat statistics or forcing victory.
- `tests/game/campaign-company.test.ts` covers surviving company, experience, learned abilities and inventory transfer, plus restart/save behavior. Chapter transition UI currently supports single-player campaigns; this work does not introduce a cooperative campaign lobby or transition protocol.

## Environment and rendering

Nineteen editable Blender environment masters have been validated. They include ancient trunks, fallen boughs, ferns, brambles, mushrooms, leaves, acorns, boulders, roots, the hollow-stump gate, three crossings, indoor walls, resin sconces, a wellspring, Lanterncap Grove and the Bitter Heart. Source recipes and published asset records accompany them.

The water renderer supports authored flow, depth color, shallow margins, foam, caustics and reflections. Foliage uses bounded wind deformation shared by visible and shadow materials. Animated canopy openings and cloud shade agree with the warm volumetric shafts. Large scenery uses an observed-unit cutaway mask; it does not reveal hidden enemies or alter collision.

The Vault adds 24 porous mycelium beds among its foliage and 384 slowly drifting spore billboards. Decals fade at steep banks and water, and render before the water surface. Image generation sources, exact prompts and publishing metadata are retained. Spores remain cosmetic and use a single bounded batch.

`art/sources/environment/crossing-kit/floor-validation.json` records Blender ray checks against declared walking profiles: 108 root samples (maximum error about 2.9 mm), 72 timber samples (below 0.01 mm) and 54 stone samples (about 3.5 cm). Decorative stone relief accounts for the latter difference.

## Layered simulation and authoring

Navigation identifies terrain as level 0 and elevated surfaces by explicit levels, heights and endpoint connections. It supports overlapping routes, clearance constraints and traversal between declared levels. Selection, orders, save state, projectiles, loot and floor-aware visibility carry the surface identity. Tests cover lower passages, ramps, mismatched connections, melee separation and arrows fired downward.

`tests/net/layered-lockstep.test.ts` runs two Room/Lockstep peers for 1,100 ticks on the published arched root. A walker passes underneath, an archer climbs and attacks below, and one peer resumes a JSON save mid-climb. Peer checksums and both players' floor visibility arrays stay equal.

`tests/editor/layered-authoring.test.ts` exercises the real editor control operations and map roundtrip for surface overrides, endpoint connections, indoor ceiling and spores. Manual editor checks confirmed fractional wind controls and bridge editing. A regression now prevents a height-only edit from dropping inherited endpoint links. Explicit empty connections still mean no links.

## Close cameras and cinematic capability

The selected-unit spyglass cycles default RTS, third-person and first-person views. The default J binding is configurable; Escape returns to RTS. Death, lost subjects and save loads restore appropriate camera state. Lua missions can declare timed camera shots; the Vault introduction looks toward the Marshal from an archer's first-person view.

Close cameras follow the rendered unit pose. First-person rendering hides the subject body while preserving its shadow. Third-person distance is constrained by scenery, terrain and the authored indoor ceiling. The Vault ceiling appears in close views and stays absent in the RTS cutaway. Camera changes do not change simulation visibility or player orders.

The camera collision uses a center boom rather than a swept camera volume. These are observation cameras, not a direct-control movement mode. Close views also expose the existing stylized, low-poly character detail.

## Regression and performance evidence

- Full regression: **859 tests in 204 files passed**. After the final bridge-inspector correction, **11 relevant editor, selection and crossing tests passed**, including the new regression. These are separate runs, not a claimed complete 860-test run.
- Production TypeScript/Vite build passed after that correction.
- Blender validation passed for **19 editable environment masters**. Asset compilation validated **362 published records**.
- Publishing the asset manifest no longer restarts Vite through an accidental configuration dependency. A controlled publication and an unchanged authoring save both succeeded without restart.

Warmed local renderer measurements used a 2560 × 1440 drawing buffer, full render scale and soft shadows. The Hollow Gate stone-crossing view measured **6.11 ms mean / 6.74 ms p95 GPU** and **2.04 ms measured CPU scopes**. The final Vault gallery, including mycelium and spores, measured **4.26 ms mean / 4.81 ms p95 GPU** and **2.00 ms CPU scopes**. Each used the final 120 samples of a 360-frame fixed-view run. Original rendering settings were restored; no shader errors were reported in the final gallery check.

These timings measure fixed scenes on this machine, not large battles or a cross-hardware performance guarantee. The levels have automated gameplay coverage and manual visual inspection; this is not a claim of final balance or a complete manual campaign playthrough. Environment models remain static geometry except for declared shader animation; destruction animation is outside this milestone.

Local validation logs are under `tmp/canopy/`: `final-environment-regression.log`, `editor-final-tests.log`, `final-canopy-build.log`, `final-blend-validation.log`, `mycelium-asset-compile.log` and `publication-restart-check.log`. Those temporary logs are local evidence, not required runtime assets.
