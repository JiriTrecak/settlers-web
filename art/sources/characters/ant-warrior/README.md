# Ant Warrior

Original editable Blender warrior from the supplied helmeted turnaround. The subsequent direction removes sprout emblems, keeps shaped nostrils and an articulated speech mouth, rotates the shield outward 90° into a bent-elbow grip, and removes the protruding rear abdomen beneath the waist-hung back cloth. The shield uses a continuous convex shell, fitted ownership insert, and a rounded cup under broad overlapping scales. Ownership affects shoulder leaves, front/back cloth and the inset shield panel. Orange chitin, eyes, helmet, wood, ivory blade and buckle remain natural.

`model.py` builds named separate parts, then a 26-bone rigid-shell armature. Geometry is simplified before binding with protected face/scallop features and an asserted budget below 5,000 triangles. `asset.json` declares the character profile and attack contact. Reference, palette, scripts and configuration are packed into `ant-warrior.blend`.

## Animation contract

- `idle`, `walk`, `run`, `carry`: in-place loops. Army movement uses run; charge aliases run. Run's planted-foot phase is calibrated for the existing 4-unit/s movement and 1.5× playback.
- `attack_sword`: anticipation, held windup, rapid diagonal cut, recovery. Contact is 0.55. Runtime seeks it from authoritative attack start/impact/end ticks; clip events never award damage.
- `hit`: shield recoil. A small local body recoil can overlay an ongoing attack without changing the simulation.
- `death`: one-shot, held final pose. The existing renderer retains a short, visibility-filtered corpse.
- `jaw`: speech hinge, independent of action choice. The dark opening has head-bound upper vertices and jaw-bound lower vertices. `CharacterPlayer.speak(0..1)` drives it; actual dialogue uses the existing speech envelope, and the studio has a Speaking checkbox.
- Hand/back and blade-base/tip sockets are preserved. Short blade ribbons follow actual posed sockets only during the cut. Hit sparks require observed HP loss.

## Rebuild and publish

Run `node experiments/building-studio/launch.mjs serve ant-warrior --category characters --port 8768`. While serving, use its build action to regenerate or render action to preserve manual Blender edits. Without the server, use the corresponding `build` command. Then run `node --import tsx scripts/assets/publish-ant-warrior.ts`.

The runtime asset is `assets/library/asset.models.units.ants-warrior/geometry.glb`, bound to the existing `asset.ants.warrior` and `unit.ants.warrior`. The canonical package is `art/assets/asset.models.units.ants-warrior`. The game rules, training costs, hitpoints and damage are unchanged. Test the real simulation in `/combat-lab.html`, including Warrior duel and 12 vs 12 warriors.

The model deliberately uses smooth shaded, economical geometry and separate material colors rather than detailed painted textures. The reference's cinematic lighting is not baked into the model. No LODs or recorded voice/audio are supplied.
