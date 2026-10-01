# Spell Editor and declarative abilities

The **Spell Editor** is a separate application. Start `npm run dev:spells` and open `http://127.0.0.1:5177/`. It does not require the game or map editor to be open. `npm run mcp:spells` starts its independent stdio MCP server; the editor service must be running.

## Current capability set

Holy Light demonstrates the first complete direct-cast lifecycle: target a visible living unit, heal an ally for 100 or damage an enemy for 50 through normal combat mitigation. It reserves 25 mana, prepares for 12 simulation ticks, releases, recovers for 8 ticks, and starts a 200-tick cooldown at release. One tick is 25 ms. Turning can precede preparation. Stopping or invalidating preparation refunds the reservation; stopping recovery does not refund released effects.

The strict schema supports rank parameters; unit, ground and self targeting; ally/enemy branches; heal/damage; channelled waves; homing projectiles; bounded chains; piercing lines; timed statuses and periodic damage; passive auras; temporary summons; dispels; and autocast. Unknown operations fail validation.

**Blizzard** targets visible ground within 18 units. It reserves 60 mana, prepares for 12 ticks, then channels six waves at 40-tick intervals. Each impact damages up to 64 living enemy units within radius 5 for 30 spell damage through normal mitigation. The first impact is one interval after release; the area remains fixed and victims are selected afresh in stable entity-ID order for every wave. Moving, stopping, stun, death or owner change ends remaining waves. Only pre-release cancellation refunds mana; cooldown starts at release. Already applied damage stays applied. The next wave, index and channel clocks are saved/checksummed. Losing sight of the area after release does not retarget or cancel it.

These are declarative `targeting.kind: point`, `targeting.radius` and `cast.channel` capabilities, not a Blizzard opcode. `onRelease` is the impact program: once for direct delivery, once per wave for channel delivery.

## Workbench

- **Ability:** name, description, rank-one values, prepare/recover timing, validated JSON and published unit bindings.
- **Encounter:** caster and target models, one to eight targets, spacing, relationship, health, mana, distance, biome and active rank. Click the stage to aim ground spells; dragging still orbits. Ground spells default to a group of enemies. Stun, target displacement and removal exercise real cancellation rules.
- **Visuals:** event-anchored rings, soft ground glows, pillars, camera-facing sigils, rising light strips, textured bursts real target lights and falling textured ice/rain. `durationFrom: delivery`, `sizeFrom: radius` and `spreadFrom: radius` bind visual dimensions to authoritative channel events, so changing spell radius or wave interval keeps the storm synchronized. Rain supports `fallSpeed`, `launchDelayMs`, `fallAngleDegrees` (from vertical), `fallAzimuthDegrees` and a nested `impact` burst. Blizzard launches each shard with a stable random 0–50 ms delay, falls at 30° with `fallSpeed: 2.6` (approximately 385 ms travel), and emits blue fragments plus a small ground flash at its terrain-sampled landing point. The old storm/impact rings are removed. Faster rain starts later within the wave interval so contact remains aligned with damage. Landing positions stay inside the target disc; visual impacts may trail the simultaneous damage tick by up to 50 ms. Randomness derives from cast, wave tick and shard index, so seeking is repeatable and never touches simulation RNG. Impact tails share the 512-particle budget and are removed on interruption. Disc-distributed bursts remain available for other spells. Edit colours, textures, intensity, size, count, height, spread, strip length and duration. Advanced JSON exposes target-following and semantic animation clips. Holy Light combines target illumination, a floating sigil and rising strips on release, plus an impact burst on heal/damage.
- **Views:** encounter, caster, target, effect-only and biome environment. These share the game's renderer, models, team colours and lighting.
- **Transport:** cast, interrupt, reset, pause, single tick, and playback speed. There are no spell-specific preview buttons or hand-picked preview times. Timeline stages and visual spans come from the selected definition, presentation, and simulation events. `preview.replay` accepts an explicit tick and optional `from: release` for automated inspection. The bottom Timeline has animation, impact, status and visual-effect tracks. Drag the tick-accurate playhead or click a span to seek; the Events tab retains the event inspector. Seeking reconstructs the same take, including recorded interruption probes.

The backend creates an isolated instance of the actual `Game` simulation. It runs at 40 ticks per second and never edits a production map. Renderer frames cannot apply healing or damage. Preview reset clears actors and cues; the event inspector shows authoritative lifecycle outcomes and a state checksum.

Save validates and commits the draft with an expected revision. Publish requires saved changes and replaces the current definition under its stable ID; already running matches retain their loaded content. The unit-binding panel attaches a **published** ability to an existing unit. AI-only bindings have no player button. Bindings and drafts reject concurrent edits rather than overwriting them.

## Files and publication

Each ability has one folder:

```text
content/abilities/ability.core.holy-light-lite/definition.json
content/abilities/ability.core.holy-light-lite/presentation.json
```

`content/abilities/published.json` is the single current published library. There are no historical release files, version selectors, or dependency pins. Texture resources remain in the standard Asset Studio pipeline; Holy Light uses `asset.effects.holy-light-spark` and `asset.effects.holy-light-sigil`; Blizzard also uses the original generated `asset.effects.blizzard-ice`, role `image`, index `1`. Each source and 256px runtime image is in its asset's own folder. Spells never name uploaded filenames.

Spells reference assets by stable ID and role/index. Republishing a texture under the same ID updates its consumers without republishing their spells. Publishing still verifies current resource bytes and rejects missing references; a referenced asset cannot be removed until its consumers are updated. Startup validates the current definitions and image references. Multiplayer holds early turns until peers agree on simulation build and the SHA-256 identity of published content. The same serializable source is passed to the worker, validated, frozen and checked against the main-thread registry fingerprint.

This version resolves the **local published library bundled with the game**. Downloading community packs, per-map package selection and remote registries are later work. There is no arbitrary-code spell import or active-match hot replacement.

## MCP workflow

Configure an MCP client to run `npm run mcp:spells` from the repository root. The server exposes:

- `spell_schema {}`: discover document and command schemas.
- `spell_author {command: ...}`: the same operations used by the application.

Start with `list`, `catalog` and `read`. Keep the returned revision. Modify the returned document, then call `validate`, `preview.load`, `preview.cast` and `preview.step`. Inspect recipient health/statuses, checksum and events. Each `preview.cast` resets the fixture and starts a fresh take, bypassing mana costs and cooldowns only in the cloned preview definition; published gameplay definitions retain their values. Passive abilities are absent until Cast grants the ability and activates the normal aura interpreter. Use `save` with `expectedRevision`, followed by `publish` with the newly returned revision. New documents use `expectedRevision: null` and unique definition/presentation IDs.

```json
{"command":{"op":"read","id":"ability.core.holy-light-lite"}}
```

A preview accepts the whole document plus settings; omitted setting fields receive defaults:

```json
{"command":{"op":"preview.load","document":"<document returned by read>","settings":{"relationship":"enemy","targetHealth":300,"distance":6}}}
```

The `document` placeholder above must be replaced by the JSON object, not a string. Then:

```json
{"command":{"op":"preview.cast"}}
{"command":{"op":"preview.step","ticks":30}}
```

For bindings, `binding.read` takes a unit definition ID and returns its caster policy and the content revision. `bind` takes that definition, a complete caster policy and `expectedRevision`. It validates against published abilities and the full game registry before writing. Batch authoring can sequence these commands per document without driving the browser.

`preview.autocast {enabled}` toggles the same saved autocast command as the game. `preview.attack` is an MCP-only diagnostic command; enable real attacks in encounter settings first. The visual workbench never exposes unit movement or attack orders. `settings.initialStatuses` accepts published status-spell IDs for testing dispels. The status selector is populated from published abilities that declare status operations.

`preview.seek {tick}` pauses and reconstructs a frame in the active take. `preview.target {entity}` selects a unit (0 clears selection); The UI uses `preview.beginCast` to reset immediately and enter targeting for unit/point spells (self spells and auras fire immediately). A canvas click sends `preview.confirmTarget {target}` to fire; invalid targets keep targeting open, and Escape cancels it. The target indicator follows the pointer. `preview.cast` remains the direct-fire automation command. Changing the aim ends the old take. The always-visible Setup dropdown provides single/five enemy ants, single/five allied ants, a mixed hostile neutral camp, empty ground (`targetCount: 0`), and caster-only. Choosing a preset resets and respawns the fixture. Settings are independent of spell selection and survive switching abilities; ally presets start wounded for healing tests. Neutral camp members use neutral ownership and the normal hostile-camp rules. Fixtures default to stationary targets. The opt-in Combat scenario setting enables movement and weapon attacks; passive preview ticks retain combat definitions for melee/ranged eligibility but skip autonomous combat and movement while running the actual spell lifecycle, damage, status, summon, and cast-facing systems. The stage uses only a grid, without unit pedestals. Initial target status options come from published definitions containing status operations, rather than a built-in list of spell names. A no-target unit spell is rejected normally; point spells still fire on empty ground. New fixtures remain idle until Cast.

Other preview commands are `preview.aim` (integer world position), `preview.state`, `preview.play`, `preview.stop`, `preview.reset`, `preview.replay`, `preview.rank`, `preview.stun`, `preview.displace` and `preview.kill`. MCP and UI control the same encounter. A newly loaded MCP document is reflected by a clean UI; unsaved UI edits are retained.

## Integration and limits

The Ant Marshal has player/AI bindings for Holy Light on Q and Blizzard on W. The Root Seer has a hidden AI binding and scores wounded camp allies through the same targeting and cast interpreter. Campaign company transfer carries learned binding ranks; full saves preserve escrow, cooldowns and pending casts. Obsolete spell saves require the new simulation build.

Presentation events are observer-filtered and excluded from checksummed state. Events have unique cast/event identities, finite lifetimes and terrain-relative anchors. A renderer caps 64 active cues, 512 particles and four shadowless point lights; cosmetic culling never changes gameplay. Clip phases are sampled from simulation ticks using the same helper in the game and workbench. A missing requested clip uses the declared fallback. Rich socket attachment, sound authoring and general animation sequencing remain future work.

Focused regression tests live in `tests/abilities/` and `tests/render/declarative-abilities.test.ts`. They cover publication, real-game heal/damage, interruption, neutral AI, save/restore, texture closure, animation phases and repeated effect cleanup. Network tests cover content disagreement before commits.

Blizzard tests in `tests/abilities/blizzard.test.ts` cover wave timing, fixed ground position, moving victims, ally exclusion, interruption, resource commitment, mid-channel save/replay and forged clock rejection. The renderer tests exercise falling particles, radius/timing bindings and cancellation cleanup.

### Spell command artwork

A presentation may declare `icon` as a published image asset ID. The icon resolves to the current published asset, just like effect textures. Command cards (including learning) inherit it; a unit binding can explicitly override it. The Spell Editor exposes a Command icon selector and shows the same artwork in its library and Cast button. Holy Light and Blizzard use original generated paintings with full source masters in `art/assets/asset.icons.spell-{holy-light,blizzard}/source.png`; their runtime `image.png` files follow the 128×128 icon profile. Generation prompts are retained in each asset's provenance.

## Eight mechanics examples

These are single-rank, Warcraft III-inspired mechanics examples with original artwork and our game's combat balance. They are published and can be bound to any unit through the editor; the existing Marshal's Q/W loadout is preserved.

1. **Storm Bolt**: a homing projectile, damage at impact, 5-second stun (3 seconds against heroes), immediate channel interruption. Released projectiles survive caster death; dead/untargetable or newly allied targets fizzle. The projectile follows live positions and resumes visually after load.
2. **Entangling Roots**: 9-second movement/attack restriction, 15 damage each second, including the final tick. Heroes receive a 3-second duration. Casting is allowed. Refresh replaces rather than stacks the status and restarts its periodic clock.
3. **Bloodlust**: +40% attack speed and +25% movement for 60 seconds through the shared resolved-stat path. Right-click the game command or use the workbench toggle for autocast. Autocast is saved, costs ordinary mana, obeys cooldowns/visibility, and avoids already-buffed recipients.
4. **Chain Lightning**: four distinct targets, nearest visible eligible target with entity ID tie-breaks, 15% damage reduction per hop. Each segment uses its previous impact as its visual origin.
5. **Shockwave**: a 24-unit swept line, 1.8-unit half-width, 75 damage once per victim, including enemy structures. Ground targeting previews direction; geometry tests each traversed segment so fast waves cannot tunnel through a target.
6. **Vampiric Aura**: nearby friendly melee units gain 15% lifesteal on actual ordinary attack damage. Multiple sources of the same aura do not stack; the highest rank then lowest source ID wins. Membership is rebuilt before navigation/combat, so moving out or losing the source removes the modifier. Ability damage cannot trigger lifesteal.
7. **Feral Spirit**: two controllable 60-second forest spirits, using the existing forest-spirit model by design. They spawn on valid free terrain using their actual dimensions, require no supply, replace their caster's previous group, and have ordinary combat and ownership. This is an adaptation of the wolf-summoning example, not a new wolf model.
8. **Dispel Magic**: removes eligible positive and negative spell statuses in an area and deals 200 spell damage to enemy summons. Non-dispellable stuns and aura membership remain. Item statuses are a separate content vocabulary and are not implicitly dispelled.

### Durable mechanics and presentation

Status records contain declaration ID, source, owner, rank, cast identity, start/expiry and periodic clocks. The resolved-stat path reads their declared modifiers alongside equipment. Control restrictions use the same movement/combat gates as existing controls. Delivery records store their fixed-precision positions, target, hit history and attenuation; all are included in snapshots/checksums. Restore validates references and clocks before changing the live world. `declarative-sim-51` separates this build from older peers/saves.

Live projectile positions are observer-filtered independently of caster visibility. The render layer reconstructs missiles and statuses after loading, follows authoritative positions, and removes status cues on dispel/expiry/death. It cannot apply gameplay damage. `beam`, `missile` and `wavefront` are reusable cue shapes; textures can use normal/additive blending and ground-facing or camera-facing orientation. New original effect textures are `asset.effects.storm-hammer`, `asset.effects.living-roots`, and `asset.effects.seismic-crescent`. Eight new icons use the `asset.icons.spell-<name>` convention. Full generation prompts live with asset provenance; runtime icons are 128px and effects 256px.

Bounds: 512 in-flight deliveries per world; 128 victims per line/area; 16 chain hits; 32 statuses per actor; eight summons per operation. These are engine capability limits, not visual settings. A summon may produce fewer units if no valid placement exists. New spells must stay within these limits; sound, corpse targeting, transformations and custom summon models are separate capabilities.


### Layered ground auras

A presentation can compose up to 16 ordinary cues. Use `shape: "billboard"`, a published transparent `texture`, and `orientation: "ground"` for a ground-facing symbol. `follow: true` follows the recipient. `shape: "glow"` provides the soft untextured light pool. Put layers at slightly different `height` offsets to avoid coplanar flicker.

`lifetime: "status"` binds a target `statusApplied` layer to the actual observed status: steady opacity, no finite fade/restart, removed on expiry, dispel, range loss, or death. It supports billboard, glow, ring, and light layers. Regular finite cues retain their existing envelopes. Aura animation uses the world tick phase, so rebuilding membership each tick, load, visibility re-entry, and preview seeking do not restart the cycle. Timed statuses use their start tick.

Reusable `motion` channels are independent:

```json
{
  "rotation": {"periodTicks": 320, "direction": "clockwise", "phaseDegrees": 0},
  "scale": {"periodTicks": 80, "min": 0.72, "max": 1.06, "easing": "bounce", "phase": 0},
  "opacity": {"periodTicks": 80, "min": 0.7, "max": 1, "easing": "sine"}
}
```

There are 40 simulation ticks per second. Scale and opacity pulse between their bounds; `sine`, `smoothstep`, and `bounce` are supported. The workbench's **Visuals → Layer animation** controls expose these channels, direction, phase, lifetime, follow, orientation, and blending. MCP uses the same document schema through `spell_schema` and normal save/publish commands. No spell names are consulted by the renderer or these controls.

Vampiric Aura uses a constant violet glow, an eight-second outer wreath rotation, and a two-second bouncing inner bat crest. Thorns Aura uses an emerald glow, a twelve-second reverse-rotating bramble wreath, and a 2.8-second breathing thorn-heart. Four original generated ground textures are 512×512 RGBA; the Thorns command icon is 128×128. Generation descriptions live in each `art/assets/asset.effects.{vampiric-wreath,vampiric-crest,thorns-wreath,thorns-heart}/generation.json`.

Thorns grants `meleeReflectionPermille: 200` through the shared status/item modifier path. Ordinary hostile melee hits return 20% of actual post-mitigation, post-shield damage, capped by the defender's remaining health, as spell damage (with the attacker's normal spell mitigation). Ranged/projectile/shell attacks, ability damage, zero damage, and returned damage cannot trigger reflection. Returned hits use ordinary shields, rescue, death and experience handling. The same aura does not stack; leaving its range or losing its source removes the modifier.
