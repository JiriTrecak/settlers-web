# Definitions and behavior reference

## Definition fields

Every definition has `id`, `kind`, `name`, `description`, `asset`, `icon`, and resolved `behaviors`. `body` holds maximum HP, integer armor, and armor type. `vision` is a sight radius in cells. Buildings declare an odd-cell rectangular `footprint` and an entrance offset outside it. Rotation is in degrees; building placement uses quarter turns. Unit speed is cells per second at a fixed 40 Hz simulation.

Items declare `stackLimit`; resources declare `yield` and optionally `regrowthTicks`. `hero` is metadata on units only. No inventory/progression mechanic is implied. `selectable` controls selection; `selectionClass` selects army or worker priority for area selection.

The `asset` record selects a model file, optional carry model, scale, HP-bar height, stockpile spacing, and (for batched resources) an explicit scenery catalogue asset. `icon` selects an atlas entry. Asset names never confer gameplay capabilities.

## Composed capabilities

- `movement { speed }`: participates in native navigation and movement. Path search and replanning are not content options.
- `playerControl {}`: permits owner-issued orders. Ownership alone does not grant control. Removing this also removes direct command bindings.
- `combat { damage, damageType, range, cooldownTicks, aggroRange }`: unit auto-acquisition and combat. Every armor type must be covered by every damage row in `rules.damageMultipliers`.
- `work { carryCapacity, builds }`: mobile workers can carry goods and perform native work. `builds` lists constructible definition IDs. Employment is runtime state; lumberjack/builder/carrier are jobs, not unit definitions.
- `storage { capacity, accepts }`: total physical goods capacity and accepted item IDs. A producer can also store its declared item output. A storage-only building is a depot.
- `production { mode, outputs, workerSlots, ... }`: automatic single-output production or a queued producer. `workerSlots` is currently zero or one. Queued production declares `queueCapacity`; external work declares `workRadius`; spawning declares `totalLimit`. `jobName` labels employment in the UI.
- `territory { radius }`: complete, owned buildings contribute land control. Under-construction buildings do not contribute.
- `campDefense {}`: mobile combat unit participates in its authored neutral camp's aggression/leash policy. The map must supply a camp.

Behavior sets are flat bundles. Arrays replace; known object fields merge. Conflicting set defaults require an explicit field override. `disabledBehaviors` removes a capability after expansion. Sets cannot include other sets, scripts, formulas, or engine callbacks.

## Creation belongs to the output

All creation records contain `method`, `items`, and `workTicks`. The output definition owns its price; producers only enumerate output IDs.

- `construct`: building, physical item bill, then construction work.
- `recruit`: unit, physical bill plus `unitInput` definition. One unassigned matching settler approaches and is contained during training. Successful deployment changes that entity's definition and preserves its runtime ID.
- `craft`: item; one employed worker converts the input bill to one item.
- `harvest`: item with `source` resource definition; one employed worker travels, removes finite resource yield, and carries it home.
- `plant`: resource with regrowth duration; one employed worker restores an eligible depleted site.
- `spawn`: unit, no material input; producer has a finite contribution limit.

These are native verbs. Adding a new building that uses an existing verb is content work. Adding a new verb is an explicit system change, with schema validation, state, lifecycle rules, snapshot support, and acceptance tests.

## Actions and command cards

Action metadata defines name, description, icon, priority and optional hotkey. Targeted build/produce bindings use the output's name, description, icon and price. Overrides keyed by `build:<definition>` or `produce:<definition>` may change priority/hotkey.

Bindings sort by descending priority, then ordinal binding ID. The adapter fills top-right first, across four columns and three rows, then another page. Disabled bindings retain position. Move/Attack/Stop shortcuts are semantic; target-specific shortcuts apply to the visible page. Duplicate shortcuts fail validation.

A focused building shows that building's workplace actions. Mixed units contribute only eligible actors to each binding; area selection prefers owned army units over workers. Unknown/enemy/remembered entities provide inspection data without private command cards.
