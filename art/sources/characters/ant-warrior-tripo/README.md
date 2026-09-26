# Ant Warrior — Tripo source

Approved Tripo warrior source. Published as `asset.models.units.ants-warrior`, used by `unit.ants.warrior` throughout the game and editor.

## Files

- `source.glb`: original, unmodified Tripo export: 9,490 triangles, eight segmented parts, packed textures, 65-bone Mixamo rig and seven motion takes.
- `ant-warrior-tripo.blend`: editable named parts, rig, actions, packed textures/reference, black studio and camera.
- `model.py`: reproducible import/cleanup adapter. This imports Tripo geometry; it does not pretend the mesh was generated procedurally in Blender.
- `warrior.glb`: optimized skinned game export. `model.glb` is the identical studio copy.
- `asset.json`, `character.json`: camera, per-part reduction, role and animation mapping.
- `render.png`, `comparison.png`: latest reference-pose render and comparison.

## Provenance and processing

The starting candidate already existed in the user's signed-in Tripo Studio account: `65365d12-0a6e-4a56-809f-4d4bbceed95f`. Studio showed its generation, segmentation, texture-generation and rigging stages complete. We reused it instead of paying to duplicate it. Added idle/walk/run/hit presets and generated **Diagonal Sword Slash**, a three-second text-to-motion take, using 20 Studio credits. Studio balance changed from 3,135 to 3,115. No subscription or credit purchase was made.

The CLI is installed and authenticated; the API account reported zero API credits. This experiment therefore used the existing Studio balance. Studio and API credits are separate.

Local adaptation: rigid head/equipment weights, closed finger grips, restrained locomotion arm swing, corrected attack wrist orientation, a 1.25-second attack, hidden rear shell and a plain rear cloth panel. Green clothing/shoulder regions are assigned `TC_TeamColor` with a red default. Natural texture images remain unchanged. Coincident importer seam vertices are welded before reduction to avoid cracks. Runtime reduction applies to disposable copies so saved Blender meshes stay editable at full source resolution.

The attack event is set at 35/71 of the clip, based on inspection of the generated strike; the renderer samples that phase at the simulation impact tick; paired and 12-versus-12 combat have been verified. Source presets are retained in `source.glb`; `slash_preset` is exported as an alternate take.

## Preview and rebuild

```sh
node experiments/building-studio/launch.mjs serve ant-warrior-tripo --category characters --port 8769
```

Use the studio's Build action to reproduce the adapter, or Render after manual Blender edits. Team colors can be switched in the 3D viewer. Idle, walk, run, attack, hit and death use the shared character player. Speaking is unsupported: Tripo did not supply facial bones or mouth shapes.

## Status and boundaries

This is now the active game warrior. `scripts/assets/publish-ant-warrior.ts` publishes the model, portrait, source and capabilities through the canonical asset registry. `charge` maps to `run`; four hand/blade sockets support equipment and sword trails. Simulation stats and timing are unchanged. The reference was a posed character, not a clean A-pose, so some body/gear intersections and generic-human motion characteristics need additional polish before production. Eight materials remain; an atlas and lower-cost crowd rig are future optimization opportunities. The generated textures contain painted lighting and eye highlights. Team areas use mesh/material classification rather than a hand-authored texture mask; inspect their boundaries before final production use. No carry animation is advertised for this warrior study.

## Verified export

Final export: **4,905 triangles**, one skinned mesh, eight materials, 69 bones (65 imported plus four attachment bones) and seven animation clips. Saved Blender validation passed with packed reference/textures. The live viewer loaded the GLB; front/back/side, red/blue ownership colors and motion playback were inspected. Ten targeted Vitest checks and five shared studio tests pass. A few tiny green texture fringes remain at ownership boundaries; facial animation remains unimplemented. The actual simulation/entity renderer was inspected in a duel and a 12-versus-12 fight, including normal-speed playback; no runtime errors were reported.

Publish after rebuilding the source:

```sh
node --import tsx scripts/assets/publish-ant-warrior.ts
```

The published `assets/library/asset.models.units.ants-warrior/geometry.glb` is byte-identical to `warrior.glb`. Skeletons and team materials are cloned per unit; geometry and embedded textures remain shared.
