# Animated ant characters

Three compatible variants are exported to `assets/models/units/ants/`: `worker/model.glb`, `warrior/model.glb`, `archer/model.glb`. The master editable source is `art/sources/characters/ant-family/ant-family.blend`; its recipe defines the common anatomy first, then warrior equipment, then archer equipment. `model.glb` in that source folder contains all three equipment groups for the studio. Per-role files contain only that role's geometry, sharing the same skeleton and clip names.

These are an original low-poly interpretation and first animation pass. They prioritize head/antenna silhouette and role readability over the portrait's scratches and small armor details. Skinning uses rigid shell segments appropriate to an exoskeleton. Feet are at zero, glTF is Y up / forward +Z, and standing antenna height is about 2 scene units. Check `Beside workshop` in the studio for authored scale. No weapon is baked into the base body.

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCharacterInstance } from './character-player.js';

const gltf = await new GLTFLoader().loadAsync(modelUrl);
const ant = createCharacterInstance(gltf, 'warrior'); // base | warrior | archer
scene.add(ant.root);
ant.player.setTeamColor('#2878df');
ant.player.setState('walk');
// Every render frame, deltaSeconds is supplied by the caller:
ant.player.update(deltaSeconds);
// On a new attack command (use restart:true for repeated attacks):
ant.player.setState('attack', { restart: true });
```

States: `idle`, `walk`, `run`, `carry`, `attack`, `hit`, `death`. `attack` maps to `attack_unarmed`, `attack_sword`, or `attack_bow`; the caller does not need to know the clip names. Idle, walking, running and carrying loop. Use `run` for army movement and `walk` for settlers; this animation choice does not set simulation movement speed. Default playback speed is 1.5×. Attacks/hits play once and return to idle. Death holds its final frame. Clips are in-place; the simulation owns world position and collision. A new movement command can interrupt an attack. Do not resend the same attack with `restart:true` every frame.

Optional `onEvent` reports `hit` at 55% of a melee clip or `release` at 65% of a bow clip. These are timing hooks for visuals/audio; simulation damage and projectile ownership remain the game's authority. The bow includes a drawn string and hides its held arrow briefly on release; an actual flying arrow is a separate runtime object. The module does not modify the game's existing units or asset declarations automatically.

The factory shares geometry but clones skeletons and materials so one unit's pose/player color does not change another unit. Use `dispose()` on an instance to release its owned resources; the loaded prototype owns the shared geometry. Calling `new CharacterPlayer` directly assumes material isolation is already handled. `TC_TeamColor` is the exact recolorable material, with authored red stored in its base-color factor (no baked red vertex colors).

Blender socket bone names are `socket_hand.L`, `socket_hand.R`, `socket_back`; Three.js sanitizes the hand names to `socket_handL` and `socket_handR`. Extra equipment can be parented to those bones with its own local attachment transform.

Studio: `node experiments/building-studio/launch.mjs serve ant-family --category characters --port 8768`. Save the master .blend to hot reload. To rebuild from the recipe use the studio's build action, or the CLI build command with the server stopped. The character exporter preserves skin weights, rig, animation clips, and role metadata; only disposable export copies are merged per equipment group. Publish updated variants by copying the three GLBs and `character.json` to the game asset folder after visual checks.

Tests load the actual exported GLB and verify skinning, independent instances, state routing, event timing, pausing, scrubbing, and death playback. Crowd performance, foot-contact polish, and art fidelity should be evaluated in the final gameplay camera before replacing the existing units.


## Engine integration

The game now selects these GLBs through asset declarations in `content/game.json`: `character: "base" | "warrior" | "archer"`. SettlementLayer caches the loaded GLTF, creates independent rig instances through the factory, and advances visible instances using ordinary frame seconds (clamped after a stall). Default playback remains 1.5×. Declared scale is applied once; the ants currently retain their authored approximately 2.03-unit height.

All ordered movement and moving carriers use run at normal movement speed. Only idle worker strolls use walk at the declared walkSpeed; stationary loaded workers retain carry. A cooldown increase from an observed simulated strike restarts attack once. Damage decreases trigger hit when stationary. Moving again interrupts the one-shot. The existing projectile effect and all damage remain simulation-driven; clip callbacks are not gameplay commands.

Observation records brief, visibility-filtered death cues before removing a killed unit. The renderer can retain an unselectable two-second death pose only for an already-rendered unit with such a cue. Disappearance into fog or recruitment does not imply death. Corpses vanish when hidden by fog. These cues are presentation-only, are not saved, and clear on restore.

Instance disposal releases mixer actions, independent skeleton GPU resources and materials; shared source geometry lives until the layer is destroyed. Nonanimated neutral models keep their existing rendering.

## Future asset contract

For new mobile characters, author in-place idle, walk/run (as appropriate), attack, hit and death clips, plus carry for workers. Use Y-up, +Z-forward, feet at zero and the exact material name `TC_TeamColor`. Keep equipment sockets stable. Different attack clip names can map to the common attack state. Buildings need only relevant clips, such as working or destruction; they do not need locomotion clips.

Animation mappings are embedded in the GLB rig extras as `characterProfile`: `variants[role].states` maps engine state names to clips, and `attackEvents[role]` declares the event and normalized time. The controller and studio read this metadata. New heroes and creatures declare their own role in `asset.json.characterVariants`; there is no hardcoded ant-role list in the runtime. `cast` is a one-shot state when declared. The exporter validates mapped clips before writing a GLB. Authoring stride-distance or reference movement-speed metadata would also let us calibrate foot motion systematically; current playback uses the supplied 1.5× rate.

Worker actions: the base ant additionally supports looping `build` (small hammer) and `chop` (axe). Tool bones reveal only the matching tool in each clip and hide both during other actions. Use `setState('build')` or `setState('chop')`, then `idle`/`walk` to stop work. Build strikes horizontally toward a wall with an upright hammer; chop uses a double-headed crescent axe, held in both hands, with coordinated arm movement and torso rotation through a horizontal strike into a standing trunk. These are stationary in-place cycles striking a target in front of the right hand; the engine positions and faces the worker relative to its work target. Warrior/archer work requests are rejected. Work impacts remain simulation-owned. During tree chopping the renderer samples the chop clip from the observed work cycle, matching axe contact to the declared impact tick; it does not award damage from animation callbacks. The viewer automatically selects the base ant when selecting these actions.

Worker work clips are connected through creation.workAnimation. Constructed buildings declare build (also used for repair); item.log harvesting declares chop. Observation emits a work pose only for an arrived, stationary worker performing that job, never during the harvest return trip. Visible workers share that pose across viewers; the renderer faces the work target. Progress and goods remain entirely simulation-owned.

### Runtime material consolidation

`SettlementLayer` calls `batchCharacterMaterials` once per loaded character source, before creating instances. Compatible sibling skinned surfaces share one standard PBR material with vertex colors and a tiny nearest-filtered roughness/metalness palette. `TC_TeamColor` remains separate. No geometry simplification or animation changes occur. Textured, morphing, directly animated mesh nodes and non-standard materials are left untouched. The layer owns palette disposal; instance materials still use the normal character factory lifecycle.

Tree work cycles use `creation.impactTick` (22 of 40 ticks). The final swing completes its follow-through while the worker waits for the fall; no eleventh strike is played. Other work and ordinary movement retain their existing playback. Animated vegetation uses its own 1× controller, independent of the ants’ 1.5× playback default.

### Engine cast timing

The game renderer uses observed `unit.casting.startTick` / `resolveTick` to seek
through a cast windup, then plays visual recovery after release. Asset definitions
can set `castContact` (normalized 0–1 clip phase; fallback 0.55). Marshal uses 0.68,
the end of the authored release gesture. This metadata aligns the pose only:
simulation remains authoritative for effects and damage. An interrupted pre-release
cast exits immediately; new movement/attacks can interrupt recovery. Studio playback
continues to use the controller's ordinary playback speed.

### Projectile launch sockets

An asset's `projectileSocket` names a GLB node sampled in world space after posing.
The archer uses `socket_handL` (bow grip); the bombardier uses `socket_muzzle`.
A fresh observed flight captures this once, then remains independent of its shooter.
Late/missing/hidden sources use the simulation's recorded origin with the projectile
renderer’s fallback height. This is visual metadata and does not launch projectiles,
change their authoritative timing or control damage. No socket lookup reads hidden
simulation entities.
