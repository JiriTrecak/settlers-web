# Archer animation review

Loads the published Archer GLB with canonical animation capabilities and the shared CharacterPlayer and ownership shader. Game content now binds this same asset to the Archer recruit.

Open `/scripts/bench/leaf-archer/index.html`. Switch overhead angle, facing, team colors, animation and distance. The held arrow disappears at the authored release (41/71 of the attack clip).

This is a pose review, not a simulation or projectile-flight test. Gameplay verification remains separate. The editable `source.blend` master is in `art/assets/asset.models.units.ants-leaf-archer/`.

`prepare-preview.ts` is only for inspecting future unpublished iterations; the default page loads the canonical published asset.
