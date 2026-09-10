# Declarative gameplay

Implementation reference for the clean cutover. Begin here when adding content or native behaviors. The reviewed design rationale is in `declaration-rebuild-spec.md` and `production-and-work-spec.md`; this directory records the running implementation and its contracts.

## Sources and boundaries

`content/game.json` is the editable source of truth. Its top-level categories are `definitions`, `behaviorSets`, `assets`, `actions`, and `rules`. Definitions carry their own `kind`: unit, building, resource, or item. IDs are persistent, dotted names such as `building.ants.barracks`.

The implementation uses one JSON document rather than the proposed file per definition. This makes a multi-definition edit an atomic file replacement: changing an item's requirements and its producers' acceptance cannot publish half a content graph. The editor exposes categories and definition fields; this is not a generated catalogue or an override database. Browser and headless simulations import the same source.

- `src/content/schema.ts`: strict Zod shapes; TypeScript types are inferred here.
- `src/content/registry.ts`: expansion, cross-reference validation, immutable registry, canonical content fingerprint.
- `src/content/map.ts`: deterministic starting setup expansion and placement validation.
- `src/sim/game/`: explicit authoritative systems. No DOM, renderer, or network imports.
- `src/presentation/`: selection, command bindings, target-owned costs, scenery projection.
- `src/ui/settlement/settlementHud.ts`: HTML adapter for observed state and command bindings.
- `src/render/settlement/settlementLayer.ts`: observed-entity model adapter.
- `src/editor/world/entityAuthoring.ts`: transactional map entity editing.

The old Settlement simulation, gameplay rule tables, role dispatch, asset-name resource inference, action payloads, player cubes and mapless World path have been removed. The previous map format is rejected; retained maps are authored in the current format. The old compose/mosswater/neutral-stamp generators were retired so they cannot overwrite the authored source with an incompatible format. Blender asset-generation scripts remain. Pathfinding, networking, camera, terrain and rendering infrastructure are reused.

## Author workflow

1. Open Editor → Entities. Choose Units, Buildings, Items, or Resources and an owner. Click terrain to place. Neutral-defense definitions create a camp record at placement time.
2. Use Select to drag an entity. R rotates; Delete removes it. The entity inspector edits its initial state, such as `{ "health": 35 }` or `{ "quantity": 3 }`. These values belong to the instance, not its definition.
3. Undo/Redo in the entity inspector restores entities, camps and spawn records; later terrain, scenery and lighting edits remain intact. Setup members are moved together using the Spawn tool.
4. Entities → Edit definitions opens a separate content draft. Name, description, HP, and armor have fields; the JSON pane exposes the complete category. Apply Draft checks the full graph. Save writes `content/game.json` through the local development server after validating retained map references. A stale disk revision or invalid graph leaves the previous source intact.
5. Content changes apply to newly loaded matches. Never hot-patch an active deterministic simulation. A changed fingerprint intentionally rejects incompatible saves/multiplayer revisions.

Map Save still writes the `.utcmap` JSON and makes playable maps available to Skirmish. The content editor requires the development server to write project files; packaged runtime content remains read-only.

## Add a content variant

Duplicate the warrior definition, assign a new ID, change name/stats/art/price, and add that ID to a compatible barracks' `behaviors.production.outputs`. If the new price introduces another item, add that item to the barracks' `storage.accepts` and provide sufficient capacity. No simulation, HUD, recruitment menu, or renderer branch should change.

`tests/game/content.test.ts` exercises this end to end, including recruitment and tooltip costs. If a proposed addition needs an identity check such as `definition === 'unit.ants.new-unit'` in a system, revisit whether a genuine new capability is needed.

Continue with [behavior reference](behaviors.md), [worked JSON examples](examples.md), [native systems](systems.md), and [validation and acceptance](validation.md).

Asset authoring: [team-color material contract](team-color.md). Only `TC_TeamColor` is recolored; roofs and chitin retain their authored colors.

The [implemented opponent AI](../ai/implementation.md) coordinates economy, hero and army planning from authorized map knowledge and live observations. Its [design rationale](../ai/README.md) includes the declarative policy and adversarial acceptance scenarios. The implementation document distinguishes shipped behavior from the remaining adversarial playtesting backlog.

Current economy: [amber, wood and living workers](../game/economy.md). This supersedes the historical production-chain sections of the reviewed design proposals.
