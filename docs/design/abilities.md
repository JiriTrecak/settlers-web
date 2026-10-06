# Declarative abilities and spell authoring

Status: architecture and implemented contracts, updated 2026-10-04. The declarative engine now covers direct, channelled, projectile, chain, line, aura, persistent, status, weapon, movement, concealment, revival, ownership, containment, factory, swarm and linked-form capabilities. See [Spell Studio usage and current limits](../expansion/spell-effects.md) for current proofs and acceptance results. Remote pack distribution and arbitrary actor-motion ribbons remain planned; terrain/destructible/economy and other-ability cost/cooldown modifiers are explicitly deferred.

## Decision in brief

An ability is published content, usable by any compatible unit, hero, campaign or neutral AI. The engine supplies a bounded vocabulary of targeting, effects, statuses and delivery mechanisms. Authors compose these through property panels or MCP. Our own abilities use exactly the same schema and interpreter as community abilities.

Keep gameplay, presentation and unit bindings separate. A deterministic simulation executes abilities; animation, sound and particles illustrate its events. Published dependencies are resolved and frozen before a match. Neither an animation callback nor an external content request can decide a combat outcome.

Author in an independent **Spell Editor**, a standalone application like Asset Studio. The game and map editor consume published abilities; neither hosts the spell workbench. Share engine and authoring services, not an increasingly crowded application shell.

Build the complete author → validate → preview → publish → bind → play → save/replay loop with one simple spell before expanding the vocabulary. Do not build a general scripting language or graph editor.

## 1. What exists and what must change

The old fixed line/blast/rally/guard spell runtime and embedded effects workbench have been removed. The replacement uses [strict ability schemas](../../src/content/abilities/schema.ts), the [shared interpreter](../../src/sim/abilities/runtime.ts), and [ContentRegistry](../../src/content/registry.ts). Holy Light is published declarative content, not a special-case spell class.

The implementation provides standalone UI/MCP, local publication with stable-ID references, player and hidden-neutral bindings, worker registry injection, content agreement before network commits, campaign ranks and deterministic save/restore. Cosmetic events live outside checksummed state. The runtime resolves casts, durable deliveries, status clocks and bounded lifecycle/combat reactions in deterministic simulation order. Their pending state is saved and checksummed; visual playback is independent.

The sections below retain the broader architectural contracts. They do not imply that remote package registries, every presentation primitive or later spell families exist. The implementation's local published snapshot is the first package boundary; per-map dependency manifests and downloadable packs will extend it.

## 2. Content ownership and contracts

### Ability definition

Owns name/description/icon reference, supported ranks, targeting, costs, cooldown policy, cast lifecycle, effect-program references and presentation reference. Each effect program is a small, typed, ordered list; conditions and selectors are explicit data structures. No arbitrary JavaScript, Lua, expressions evaluated as code, imports or recursion.

Rank values are typed parameter arrays with equal lengths. A compiler resolves references and rank parameters into immutable execution plans. Compilation does not bake runtime target identity, team relationships or positions.

### Effects and statuses

An effect is a one-time operation such as heal, damage, apply status, query targets, spawn a unit or teleport. A status is persistent state with duration, stacking, modifiers and bounded lifecycle hooks. A delivery mechanism schedules when effects happen: direct release, projectile impact, periodic channel or aura membership.

These are engine capabilities with tested semantics, not per-spell classes. Shared status definitions and VFX can be referenced by multiple abilities. A visible particle called “fire” does not itself apply burning.

Holy Light implements unit targeting, relation conditions, heal, damage and the cast lifecycle. Blizzard extends it with ground targeting, channeled area waves and interruptible, saved delivery clocks. Statuses, homing projectiles, auras, summons, combat reactions and persistent zones are now implemented; teleportation, temporary vision, invisibility and detection are implemented. Hero/summon/level/nature filters, bounded all/any trait-and-relation conditions and hostile/all spell-operation immunity are implemented. Holy Light and Death Coil prove organic/undead targeting and conditional heal/damage. Ranked critical strikes, evasion and cleave are implemented as passive/status combat modifiers with shared weapon integration and effect events. Appearance/stat, weapon-profile and movement forms are implemented, including takeoff/landing and air/ground targeting. Corpse consumers, ownership conversion, containment, source-linked summons, periodic factories, returning swarms and linked multi-unit forms also use shared declarative operations. World/economy changes are outside the current scope.

### Unit ability binding

A unit definition references an ability by ID through a stable binding ID. The binding specifies initial availability/rank, optional hero learning requirements, command-card placement/hotkey, autocast settings and AI policy reference. Runtime orders address the binding, avoiding ambiguity when two slots reference the same ability.

Control permissions are explicit: player, AI and/or scenario. Command-card visibility is independent. A hidden ability can still be active, paid, interruptible and subject to cooldown. A passive ability has a passive activation lifecycle; hiding an active button does not make it passive.

By default cooldowns are per caster and ability ID, so duplicate bindings do not bypass cooldown. Shared cooldown groups and charges can be added as explicit capabilities later.

Hero progression owns learned ranks, prerequisites and skill points. Mechanics do not know that a caster is a particular hero. Rank count is not hardcoded to three. Ordinary units can begin with rank one without skill-point machinery.

### Presentation and animation bindings

Spell presentations link independently published visual effects by stable ID, lifecycle event, anchor and lifetime. Effect definitions own their layer stacks, particle emitters, textures and motion. `EffectPlayer` renders them without a spell dependency; `AbilityEffects` supplies authoritative event and status context. The independent studio has separate Spells and Effects workspaces. Model layers, deterministic clip playback, positional sound, semantic actor sockets, flipbooks and delivery trails are implemented. Arbitrary actor/socket motion ribbons are not supported. Unit/model bindings map semantic animation roles (`cast.prepare`, `cast.release`, `cast.recover`, `cast.channel`) to actual clips and sockets.

This makes one spell portable between an ant, a mushroom and a neutral creature. Missing optional sockets have a declared fallback, such as entity centre; required sockets/clips fail binding validation. No assumed bone name is embedded in spell mechanics.

### Campaign and map

Maps depend on published packs and reference unit/hero definitions. Campaigns resolve the current published definitions by stable ID and carry hero identity, experience, learned ability ranks and allowed equipment across missions. They do not copy spell definitions into each hero or map.

A normal mission transition clears temporary casts/statuses/cooldowns according to campaign policy, consistent with existing company transfer. A mid-mission save preserves them. These are distinct operations.

Possession, owner changes and morphs re-evaluate binding control permissions. A neutral ability does not suddenly receive a player button unless its binding permits one. Owner change cancels an unreleased Lite cast by default.

## 3. Storage, publication and loading

Proposed canonical ability folder:

```text
content/abilities/ability.core.holy-light-lite/definition.json
content/abilities/ability.core.holy-light-lite/presentation.json
content/abilities/ability.core.holy-light-lite/tests.json
content/packs/pack.core/manifest.json
art/assets/asset.vfx.holy-light-burst/asset.json
art/assets/asset.vfx.holy-light-burst/image.png
```

Names above are proposed. Each ability has one folder with fixed filenames. Optional shared statuses/presentations receive their own typed content folders. VFX imagery remains in the established asset system, with role/index references and `image_2.png` conventions; no second texture uploader or arbitrary filename field. Reuse published assets by ID instead of copying them into every spell.

Pack manifests declare namespace, schema version, required engine capabilities, included definitions and dependencies. Local drafts have revisions. Publishing replaces the current definition under its stable ID. Consumers always resolve the current published content; no historical releases or dependency version pins are stored. Duplicate IDs across packages are errors. Overrides require an explicit replacement policy, never load-order wins.

Publication performs schema checks, reference resolution, cycle/budget checks, unit-binding checks and authored scenario tests. It stages all output first, verifies asset hashes and then atomically updates the current published library using the existing transaction infrastructure. A failure leaves the previous publication intact. Renames/removals show reverse references; a referenced definition cannot silently disappear.

At launch, the engine resolves current map/campaign/unit/ability/asset references by stable ID and computes a content fingerprint for multiplayer agreement. The fingerprint detects mismatches; it does not select or pin an older version. Dependencies download and validate before the worker starts. Both main thread and worker receive the same resolved definition set; the worker constructs and freezes its own `ContentRegistry` from serializable data. Runtime plans are derived locally and their canonical hash is checked too.

Multiplayer ready/start requires agreement on simulation build/ABI, map revision, compiled gameplay hash and the current presentation/resource manifest. Graphics quality may differ; the published content set may not. Missing or incompatible content gives an actionable preflight error. No network fetch or hot publication modifies an active match. Preview sessions can explicitly restart with a new draft snapshot.

Untrusted packages are declarative data only. Import rejects path traversal, oversized/decompression-bomb archives, unknown operations and excessive resource budgets. Dependency graphs are acyclic, size-limited and completely resolved before execution. Existing campaign scripting remains a separate trust boundary; publishing a spell never grants script execution privileges.

## 4. Holy Light Lite: complete first contract

The following values are proposed test defaults, not balance commitments:

- One living, visible unit target; self allowed. Buildings, corpses and hostile untargetable units are ineligible.
- Ally: heal 100 HP. Enemy: deal 50 magic damage through the existing mitigation/death pipeline. A unit that is neither ally nor enemy is rejected. Actual WC3 Holy Light has different target restrictions; this is intentionally Lite.
- Costs 25 mana, range 12 world units, preparation 12 simulation ticks, recovery 8, cooldown 200. Simulation currently runs at 40 ticks/second.
- Out-of-range casts reject in v1. Automatic approach-to-cast is a later order capability, not an invisible first-version movement system.
- Acceptance validates ownership, binding/rank, target, resources, cooldown and incapacitation. It escrows mana and marks the caster busy. A second cast cannot spend that mana or bypass the pending cooldown lock.
- Release revalidates caster and target life, range, sight, eligibility and relationship. Values/rank are captured at acceptance; target position and relationship are read at release. The ally/enemy branch is chosen once at release.
- Successful release consumes escrow, starts cooldown and applies exactly one branch. Healing clamps at maximum HP. It cannot resurrect. A full-health ally is rejected at acceptance; becoming full during preparation still permits a valid, possibly zero-effective heal.
- Stop, new incompatible order, stun, caster death/removal or invalid release target cancels an unreleased cast. Refund escrow to a still-existing caster, release the busy/cooldown lock, and apply no cooldown. Do not recreate a dead/removed entity to refund it.
- After release, movement/stop may end recovery but never refunds the spell or undoes its result. Caster death after release cannot revoke completed damage/healing.

Illustrative proposed source syntax, **not accepted by today's schemas**:

```json
{
  "schemaVersion": 1,
  "id": "ability.core.holy-light-lite",
  "name": "Holy Light Lite",
  "activation": "targeted",
  "ranks": [{ "mana": 25, "heal": 100, "damage": 50, "range": 12, "cooldownTicks": 200 }],
  "targeting": {
    "kind": "unit", "alive": true, "visible": true,
    "relations": ["ally", "enemy"], "allowSelf": true,
    "range": { "rankParameter": "range" }, "outOfRange": "reject"
  },
  "cast": {
    "prepareTicks": 12, "recoverTicks": 8,
    "cost": { "resource": "mana", "amount": { "rankParameter": "mana" }, "commit": "release" },
    "cooldown": { "ticks": { "rankParameter": "cooldownTicks" }, "start": "release", "scope": "ability" },
    "cancelBeforeRelease": "refund",
    "revalidateAtRelease": ["caster", "target", "range", "visibility", "relationship"]
  },
  "onRelease": [
    {
      "op": "branch",
      "condition": { "kind": "relation", "of": "target", "to": "caster", "is": "ally" },
      "then": [{ "op": "heal", "target": "target", "amount": { "rankParameter": "heal" } }],
      "else": [{ "op": "damage", "target": "target", "amount": { "rankParameter": "damage" }, "damageType": "magic" }]
    }
  ],
  "presentation": "presentation.core.holy-light-lite"
}
```

The compiled release plan is strictly typed; only a unit selector can feed `heal`. The enemy-only else branch is safe because release eligibility has already excluded neutral relationships. If authors add a third relationship, validation requires an explicit branch for it.

Presentation: preparation hand glow; release animation accent; outcome-specific target burst and short pillar; optional sound; recovery fades. Cue intensity may use normalized rank and team colour, not change gameplay values. Author a small atlas through the existing texture asset workflow. No imported arbitrary shader code is required.

## 5. Deterministic runtime and lockstep

### Commands and authority

Extend the existing action union with a binding-addressed cast intention:

```json
{ "type": "cast", "actor": 42, "binding": "primary-heal", "target": { "kind": "unit", "entity": 81 } }
```

Later target unions include point with walk-surface identity and direction, or none. Clients never send damage, cost, rank, cast instance ID, hit results or effect execution times. The game validates intentions on the committed tick against its own state. Preview range indicators and button states are advisory.

Existing lockstep commits deliver intentions in their established player/sequence order. The simulation allocates monotonic cast IDs after accepted commands. AI uses the same validation and ability runtime. Player AI currently runs on every peer and queues next-tick actions; retain this model and do not additionally relay duplicate AI orders. Neutral controllers use an internal, permission-checked intent source, not a fabricated human player identity. Their decisions consume the intended observed information, with stable candidate ordering and seeded randomness.

Mission scripts call a typed request-cast API into that same queue. A separate scenario effect API, if needed later, must explicitly document which cast rules it bypasses; it must not masquerade as a player cast. Save/replay captures script-generated intentions or reconstructs them deterministically, never both.

### Ordering and time

Use simulation ticks, including its existing cinematic pause semantics. The lockstep transport clock can advance while gameplay is paused; cast/status durations follow the gameplay clock. No `Date.now`, render delta, animation event or worker scheduling delay participates in resolution.

Retain the outer `World` order: committed actions → game tick → deterministic AI scheduling. Define the inner ability/combat order explicitly during migration:

1. Apply command cancellations and activation requests in stable order. Expire statuses whose exclusive end tick has arrived, then update effective modifiers and regeneration.
2. Advance existing orders, movement and facing. Preparation begins once the caster is facing as required; its start tick is saved. This adds existing turn time to authored preparation, rather than hiding it in animation duration.
3. Collect due ability deliveries and ordinary combat work into a shared effect queue. Sort by `(tick, phase, sourceEntityId, instanceId, operationIndex, targetEntityId)`. Use stable IDs for ordinary attacks too. Do not depend on map/set insertion order.
4. Drain effects through shared health/status/combat services. Death and invalidation happen before processing the next queue item; run existing loot, XP, inventory, economy, revival and observation hooks exactly once. A unit killed earlier this tick cannot release later in the queue. A later stun does not retroactively cancel an earlier release.
5. Advance the existing economy/scenario stages and compute observation. Requests produced after the combat phase run no earlier than the next tick.

Replacing today's batched spell/attack damage handling with this explicit queue is a real integration change and needs combat-order regression tests. Document the tie-break policy as gameplay, not an incidental implementation detail. A zero-preparation cast can resolve in the current combat phase, but never recursively inside command validation.

### Numbers, randomness and budgets

The first spell uses integer HP/mana and ticks. All new derived fractional modifiers use integer fixed-point units with specified rounding, clamping and checked safe-integer bounds. Distance checks use the same canonical positions and squared-distance helper as movement/combat; do not introduce platform-dependent trigonometry or a second coordinate system. Existing floating-point movement is not magically made cross-platform deterministic by this design: supported-runtime replay tests remain mandatory.

New random effects use deterministic streams derived from match seed, cast instance and stable operation ID. Save their state when necessary; visual randomness uses separate streams. Selection sorts by declared metric and entity ID before truncation or random sampling. No wall-clock timeout changes gameplay results.

Declare spatial units in the schema. Lite range is in world units; it is not silently multiplied by model scale. Future caster-relative ranges must explicitly reference the caster’s declared body dimensions during compilation. Cosmetic attachment sizes may follow model dimensions without affecting range or collision. Canonical hashes use ordinal key ordering, preserved list order, normalized finite numeric values and no locale-dependent sorting.

Compile-time limits bound steps, nesting, target counts, scheduler jobs, summons and status listeners. Queries require explicit limits. An admitted effect cannot silently lose gameplay work because a frame is slow. Reserve required runtime capacity before committing resources, or reject deterministically. Reaction hooks enqueue bounded next-tick work with a cause chain and depth limit; no same-tick recursive on-hit loops. Quality settings may cull cosmetics only.

### Authoritative state versus presentation

Checksum/save authoritative binding ranks, cooldowns, escrow, pending casts, cast counters, scheduled jobs, statuses, projectiles, summon ownership, relevant AI state and RNG. A running match uses its loaded registry; snapshot compatibility is checked against that registry fingerprint. Snapshot restore validates all instance references and due ticks.

Presentation events carry `(simulationTick, castId, cueSequence)`, semantic phase/result, visible anchors and compact approved parameters. Emit only after a simulation transition. `castReleased` and `effectApplied` are distinct: direct Lite delivery can emit both on one tick; a projectile cannot.

Filter events before they leave the worker using observation rules at the event moment. Do not reveal an unseen caster ID, hidden target position or offscreen hostile telegraph. Persisting effects use current observer eligibility; a late-visible projectile/status is reconstructed from its visible state without replaying a hidden launch. Shared audio follows the same disclosure policy.

A bounded presentation event channel with sequence/acknowledgement avoids dropping bursts when snapshots skip ticks. It is excluded from gameplay hashes. On overflow/reconnect, resync persistent visuals from current observed state and drop obsolete cosmetic bursts explicitly. Dedupe event IDs. Reduced-particle and zero-render clients must reach identical simulation checksums.

## 6. Animation, VFX and authoring experience

A cast lifecycle is `accepted → turning/preparing → released → recovering → finished`, with cancellation before release. Later channels add active pulses and interruption; projectiles can outlive caster recovery. Each phase has an explicit owner and cleanup path.

Animation adapters select clips by semantic role and declared fallback. Clip phase alignment/rate fitting puts the visual strike on the authoritative release tick. Blend into and out of casts, preserve declared locomotion overlays, and cap stretch rates. Asset clip markers are visual alignment metadata; they never invoke simulation effects. Changing a clip cannot change DPS.

VFX recipes expose emitter shape, count/rate, lifetime, size/colour/opacity curves, velocity, gravity, texture atlas, blend mode, socket/world attachment and burst timing. Mesh rings, beams and decals are additional renderer primitives when needed. Each cue owns its emitters, attachments, lights and sounds; cancel/expiry/entity removal/preview reset disposes them. Define whether each attachment follows a living entity or captures a release position.

### Independent Spell Editor

Build one standalone Spell Editor application with its own entry point, development command and application shell, analogous to Asset Studio. It works without an open game session or map editor. Proposed location: `tooling/spell-editor/`. The workbench UI and authoring-server code must not enter the game runtime bundle. Retire the old map-editor Effects workbench when its replacement lands; the map editor only references published abilities through unit bindings and content dependencies.

Share the real simulation worker, ability schemas/compiler, asset catalogue, renderer, biome lighting/grading, animation adapters and publication transactions. Extract reusable engine services where necessary instead of importing the game or map editor's screen controller. Asset Studio remains responsible for model/texture authoring; the Spell Editor selects those assets and authors their spell-specific use. Both tools resolve the same published IDs.

The independent shell provides a searchable spell library, property panels, ranked-value controls, asset pickers, lifecycle timeline, validation results and event inspector. Its central stage is a clean testing space, with no gameplay HUD, economy or map-editing panels. Dedicated views include:

- **Encounter:** an actual caster facing one or more target dummies or selected unit models. Adjustable distance, facing, team relationship, health, mana and target movement expose targeting and delivery clearly.
- **Caster:** close inspection of preparation, release, recovery, animation blending and hand/weapon sockets.
- **Target:** close inspection of hits, healing, attached effects and impact placement.
- **Effect only:** isolated particle/mesh/beam composition against selectable neutral backgrounds, explicitly labelled as a cosmetic preview.
- **In environment:** the same encounter in a selected biome or loaded map, using actual game lighting and the RTS camera to check readability. This remains a view inside the independent Spell Editor, not a reason to embed it into the map editor.

Support focused views and optional simultaneous caster/target views driven by the same simulation session. Each viewport may have its own camera, but must not advance another simulation or duplicate casts. Neutral studio lighting is an explicit diagnostic mode; biome mode uses the shared biome configuration without persisting lighting overrides into a spell or map.

Preview runs the real simulation with a draft registry and minimal test fixtures. Controls include cast, repeat, pause, step tick, reset, rank, stop, stun, kill and visibility changes. Simulation-speed controls change how frequently fixed ticks execute, never their duration or gameplay equations. The event inspector shows acceptance/rejection, resource commitment, release, results and cancellation reasons. Target dummies are test fixtures using normal target/combat interfaces, not a second spell interpreter.

A backwards scrub restores a snapshot and replays intentions; it does not reverse damage or merely scrub particles. Cosmetic-only timeline preview may exist but must be labelled as such. Reset restores the encounter seed, entities, resources and pending work and disposes all previous cues. Saved encounter presets make scenarios repeatable without creating production maps.

The Spell Editor UI and a dedicated spell-authoring MCP surface call the same authoring service. They must work with only the Spell Editor/service running; do not route spell operations through a live map-editor canvas or require its connection. Reuse shared MCP transport infrastructure where useful. Proposed typed operations: create/read/patch ability, bind unit ability, import/reference VFX asset, validate, run scenario, preview/control/capture, publish. These are new operations, not existing tool names. MCP discovery returns schemas, enum choices and engine capability versions. Batch edits use expected revisions and atomic validation; diagnostics point to definition paths and broken references. File-system edits are not the public authoring protocol.

A complete agent batch can create a draft, import generated texture(s), reference them in the presentation, set parameters, bind two caster definitions, run scenarios and publish the dependency closure. Publishing externally to a public catalogue remains a separate distribution action; local publication means validated availability to the game/editor.

## 7. Design validation against real spell patterns

These are architecture walkthroughs, not executable syntax examples. The sketches use typed selectors, ordered operations and lifecycle contracts; published definitions and the strict schemas are the authority for supported fields. Category tests exercise the implemented contracts, including two-peer lockstep and mid-cast restore. Numerical balance and complete patch-specific Warcraft behaviour are deliberately not claimed to be reproduced.

### A. Holy Light Lite — direct, conditional target effect

Definition: the complete example above. Bind it to a player hero button and to a hidden neutral-healer slot with `woundedAlly` AI preference. The AI policy supplies a target, not its own healing implementation.

Trace: caster has 40 mana; ally has 20/150 HP. Acceptance escrows 25, leaving 15 available. Twelve preparation ticks after facing, release heals to 120 and starts a 200-tick cooldown. Enemy case applies 50 raw magic damage through mitigation. Death, range loss or loss of sight before release refunds and produces no result. Two different healers releasing at the same position have distinct cast IDs and independent cleanup.

**Covered now:** targeting, rank parameters, lifecycle, resource transaction, conditional effects, player/AI binding, VFX, publication and lockstep. No bespoke Holy Light opcode.

### B. Devotion Aura — passive membership and modifier ownership

Sketch: `passive aura(radius, refreshTicks, query allied living units) → apply status(armourBonus)`; status key is `(recipient, auraSource, binding)`. Competing auras use a declared `highestMagnitude` group; ties use source ID. Weaker contributions remain available when the strongest disappears.

Trace: two sources overlap an ally. It receives the strongest armour bonus once. Killing that source removes its contribution and exposes the weaker one. Leaving radius removes membership on the specified refresh tick. Refresh and expiry order cannot cause a one-tick flicker. Death/owner change clears affected memberships.

**Required later:** deterministic spatial membership, modifier aggregation, source-owned statuses, dispel/stack policy. One aura operation supports armour, mana regeneration and movement auras by changing the referenced status.

### C. Blizzard — channelled area waves

Sketch: `channel(anchor=captured point, pulseOffsets=[...], cancelOn=move/stun/death) → query radius → damage allocation → damage`; each pulse emits a visual wave. The query declares allegiance, unit/building multipliers and target cap. A capped total-damage rule allocates fixed-point amounts deterministically, with remainders assigned by target ID.

Trace: units move between wave one and wave two. Each pulse queries current occupants of the fixed area; it does not reuse the first list. Interrupt before wave three removes all future jobs. Already applied damage remains. Rain particles cannot create extra hits; missed render frames cannot skip damage.

**Required later:** channels, cancellable scheduler ownership, area selectors, aggregate allocation. Flame Strike can reuse area delivery with separate initial and residual schedules, not a new spell class.

### D. Siphon Mana — linked channel with conservative transfer

Sketch: `channel(link=caster,target, leash, visibility policy) → transferResource(donor,receiver,mana,amount)`; ally/enemy relation selects transfer direction. Transfer is one atomic operation, not an independent subtract and add. Policy specifies capacity, optional temporary overflow and later decay.

Trace: target has 7 mana, pulse requests 10. Receiver can accept 5. Transfer exactly 5, unless explicitly configured overflow permits more. Breaking the leash cancels future pulses and the beam. Target disappearance cannot duplicate resources. Relationship changes follow a declared cancel/re-evaluate policy.

**Required later:** linked channels, resource transfer primitive, optional overflow status. A beam follows the two observed anchors; it is never a gameplay connection test.

### E. Mass Teleport — bounded group operation and navigation

Sketch: `prepare → validate destination anchor → select allies near caster with limit and stable ordering → teleportGroup(destination, placementPolicy)`; optional invulnerability is a timed status, not a camera effect. Destination filters can name friendly units/buildings.

Trace: destination moves during preparation; resolve uses its current position under the declared policy. A bridge destination carries its surface ID. Plan collision-free placements against terrain, blockers, footprints and already reserved destinations before moving anything. If the caster has no valid landing, abort/refund before commit. If only some passengers fit, move the deterministic valid subset, caster first; leave the others in place. This policy is explicit and may differ from a particular Warcraft patch.

**Required later:** atomic placement plan, navigation/walk-surface integration and optional temporary status. The engine's teleport primitive owns pathing correctness; authors cannot write raw coordinates into entities.

### F. Summoned elemental / Phoenix-style rebirth — entity lifecycle

Sketch: elemental uses `spawnUnit(definition, owner=caster.owner, placement, lifetime)` with normal unit abilities and AI. A Phoenix-style creature additionally binds a lethal-transition rule: replace with egg, wait, restore creature if egg survives. Unit classification (summoned or otherwise), supply policy and expiry are explicit independent settings.

Trace: the temporary elemental expires through a lifecycle reason that does not accidentally award combat loot. Killing an egg cancels rebirth. Source death follows explicit summon ownership policy rather than deleting everything automatically. Egg/creature transition preserves the intended logical identity and prevents duplicate supply, death rewards or repeated resurrection hooks.

**Required later:** spawn/despawn reasons, unit transition primitive, bounded lifetime ownership and delayed jobs. This is partly a unit lifecycle definition, not a reason to overload ability JSON with every creature behaviour.

### Validation outcome

All six patterns can be expressed by the proposed shared contracts, provided the named later primitives exist. The walkthrough exposed five necessary boundaries: atomic resource transfer, source-owned modifiers, observable versus hidden event anchors, navigation-owned group teleport and reasoned entity replacement. These are explicit engine capabilities, not arbitrary script escape hatches.

This is an extensible foundation for the Warcraft-like authoring surface, not proof that the full surface is already specified. Inventory/item targeting, dispels, immunities, attack replacements, autocast, charges, corpse selection and morph control need their own primitive contracts when introduced. Capability negotiation must reject unsupported definitions rather than approximating their effects. The first publishable capability set should be deliberately small.

Warcraft references for the comparison surface: [Paladin](https://classic.battle.net/war3/human/units/paladin.shtml), [Archmage](https://classic.battle.net/war3/human/units/archmage.shtml), [Blood Mage](https://classic.battle.net/war3/human/units/bloodmage.shtml), [Phoenix](https://classic.battle.net/war3/human/units/phoenix.shtml). These historical guides inform test cases; our actual contracts are the explicit policies above.

## 8. Migration and delivery plan

### Step 0 — clean boundary, no compatibility engine

Inventory old spell definitions, hero bindings, UI commands, AI branches, scenario references, visual presets and tests. Remove the old four-effect runtime and built-in spells in one coherent migration, leaving units with empty new loadouts until Lite is wired. Bump incompatible save/content versions and give old-save errors a useful explanation.

Preserve shared animation, particle allocation, publication, input, combat, statistics, observation and campaign infrastructure. In particular, [current stun detection](../../src/sim/game/effects.ts) now uses independent saved control state; item immunity remains in the common control path. Inventory item, stun, damage and hero tests so shared combat behaviour does not disappear with old spells. Replace the current spell-effects documentation when the new implementation lands; the current usage document now describes the independent editor.

### Step 1 — content and simulation spine

Implement strict schemas/compilation, current-ID reference resolution, registry injection, cast target actions, binding/rank state, escrow/cooldown lifecycle and heal/damage primitives. Introduce unique instance IDs and the shared effect-order contract. Add save/restore/checksum coverage before renderer work.

### Step 2 — presentation and authoring

Implement lifecycle events with observer filtering, animation-role mapping, finite burst recipes and the standalone Spell Editor with its real-simulation encounter, caster and target views. Expose the same draft transactions, validation and preview operations through its UI and independent MCP surface. Reuse asset resource uploads/publication. Keep workbench code outside the game and map-editor bundles.

### Step 3 — publish and play the vertical slice

Create Holy Light Lite using public authoring operations, publish it, bind it to a player caster and a neutral healer, reference the pack in a map and run the real game. Verify learning availability, UI tooltips/disabled reasons, AI choice, team colours, correct animation blending and cancellation cleanup. Existing maps must resolve content explicitly, not receive an invisible builtin fallback.

### Step 4 — grow from tested spell families

Only after the slice passes, add statuses/auras, projectiles/channels and then summons/teleport/unit transitions. Each new primitive requires at least two differently authored uses and deterministic tests. This expands the common vocabulary without filling the engine with spell-name conditionals.

## 9. Acceptance gates and proof

These gates guide implementation and later extensions. The first slice has executable checks for its supported primitives; gates involving future primitives or remote packages apply when those are introduced:

- **Schema/publication:** malformed target types, missing assets, duplicate IDs, cycles, invalid rank arrays and budget excesses fail with paths. Stale revision conflicts leave drafts/publication intact. A missing external pack fails before match ready.
- **Lite lifecycle:** allied/enemy/self cases, overheal clamp, armour mitigation, insufficient mana, duplicate commands, full-health target policy, out-of-range/sight loss, turn delay, stop/stun/death on the release boundary, recovery cancellation and simultaneous casts.
- **Combat integration:** damage goes through ordinary shields/immunity/mitigation and exactly-once death/loot/XP hooks. Ability healing never revives. Existing item/status/normal-attack regressions continue to pass after old spell removal.
- **Determinism:** replay identical committed intentions on two independent runtimes, different render rates and no renderer. Compare every tick and across save/restore during turning, preparation and recovery. Include cinematic pauses and AI decisions. Replays either regenerate AI from recorded seed/state or consume recorded AI intentions with AI disabled; never both.
- **Network/content:** two peers with the same loaded content reach identical outcomes; altered ability parameters, compiler ABI or dependency bytes reject before start. Hash agreement detects mismatches; it is not an anti-cheat guarantee.
- **Visibility:** invisible casts cannot leak entity IDs, anchors, particles, sounds or telegraphs. Late visibility reconstructs persistent cues correctly. Snapshot gaps do not duplicate bursts.
- **Lifecycle/resources:** run repeated cast/cancel/death/preview-reset cycles; live emitter/attachment counts return to baseline. Cosmetic culling has no effect on simulation state.
- **Public authoring:** complete the creation/publication/binding workflow via MCP and via UI without editing engine code, then open the same published spell in both. Validate at normal RTS distance in the biome-lit arena and on a real map.
- **Tool independence:** launch the Spell Editor and exercise its MCP with the game and map editor closed. Caster/target viewports show the same cast instance; opening another viewport does not change simulation results. Verify game builds do not include the workbench UI or authoring server.
- **Campaign:** learned ranks survive allowed mission transfer; temporary casts do not. A mid-cast full save restores escrow and releases exactly once. Missing definitions or incompatible gameplay content fail save validation; there is no automatic selection of an older content version.

Deliver a small repeatable test arena and its scenario fixtures, not a repository of disposable screenshots. The first release is complete when a third party can publish a new heal/damage ability and both player and neutral units can use it deterministically without any special-case engine code.
