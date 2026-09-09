# Combat verification scene

Run the normal Vite server, then open `/experiments/combat-check/index.html`.

This development-only entry point uses the real `Game`, command validation, character assets, `SettlementLayer`, spell effects and projectile renderer. It creates an isolated scenario in memory; it does not add a selectable map or change game content. The fixture grants its Marshal level-ten XP and learns abilities through the normal skill system so all four can be inspected in one encounter.

- **Stop at next arrow** advances until an archer emits a real shot cue, then pauses.
- **Step 1 tick** advances simulation and projectile/effect time by one tick.
- Ability buttons send ordinary cast commands to a fixed target, with normal mana and cooldown rules.
- Reload resets the fixture. Play resumes the battle.

The flat ground and simple lighting intentionally expose effect silhouettes. This is not a forest performance benchmark or proof of competitive balance. Skeleton playback still uses the normal renderer wall clock; stepping controls simulation and effect time, not exact skeletal pose time.

Verified: three arrow shafts/heads in flight at tick 40; Faultline traveling impact, Rally area ring, Carapace shell and Crownfall impact during real combat. The Carapace pass exposed additive overbrightening; the game renderer now uses a low-opacity single-sided shell so the hero remains readable.

Type-check with `npx tsc -p experiments/combat-check/tsconfig.json`.

Append `?crowd=200` to add 200 animated warriors (capped at 400). The status line reports a rolling 60-render mean of CPU time spent in the entity update plus WebGL render submission, and draw calls. It is not a GPU timer or whole-game frame benchmark. A September 9 sample measured 16.60ms CPU submission and 2,291 calls for this fixture; model material groups are a significant next optimization target.

Runtime material batching reduced the same paused 200-soldier fixture to **646 calls** (72% fewer), with observed CPU submission around **5.5–6.0ms**. Character triangles are unchanged. Non-team colors use vertex attributes and exact roughness/metalness use a nearest-filtered PBR palette; team surfaces remain separate. All four ant variants are tested against the original deformed vertices and authored material factors. This is an observational comparison, not a controlled GPU benchmark.

**Aim faultline / Aim crownfall** enable pointer-driven ground previews using the game's `AbilityTarget` renderer. The harness keeps simulation paused for inspection; Escape clears the footprint. Verified line width, radial area, dashed cast reach and red out-of-range targets. In the main game, point ability command targeting invokes the same renderer and normal cast validation.
