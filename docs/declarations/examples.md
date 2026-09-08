# Adding content through JSON

These examples use existing engine capabilities and art. They are documentation examples, not additional shipping units. Edit the `definitions` array in `content/game.json` or the editor's Definitions draft. Apply validates the whole graph; Save commits it atomically.

## A heavier ant soldier

Add this complete definition:

```json
{
  "id": "unit.ants.vanguard",
  "kind": "unit",
  "name": "Vanguard",
  "description": "Durable infantry that protects the front line.",
  "asset": "asset.ants.warrior",
  "icon": "icon.ants.warrior",
  "selectionClass": "army",
  "body": { "maxHp": 160, "armor": 3, "armorType": "light" },
  "vision": 10,
  "behaviorSets": ["behavior-set.ground-army"],
  "behaviors": {
    "movement": { "speed": 3 },
    "combat": {
      "damage": 16,
      "damageType": "physical",
      "range": 1.5,
      "cooldownTicks": 40,
      "aggroRange": 10
    }
  },
  "creation": {
    "method": "recruit",
    "items": [{ "item": "item.plank", "amount": 2 }],
    "unitInput": "unit.ants.settler",
    "workTicks": 240
  }
}
```

Append `unit.ants.vanguard` to the barracks' `behaviors.production.outputs`. Its existing store accepts planks and fits this bill. The command card, tooltip price, deliveries, settler claim, training, deployment, HP and selection now follow this definition. The ground-army set supplies movement and direct control; the definition overrides speed and supplies its combat values. No new simulation or HTML branch is needed.

Optionally add an action override under `actions.overrides`:

```json
{
  "produce:unit.ants.vanguard": { "priority": 65, "hotkey": "K" }
}
```

This is an entry to merge into the existing overrides object. Priority changes presentation order only. Work scheduling and combat targeting do not read it. Conflicting shortcuts are validation failures.

If the unit later costs stone as well, the unit's bill changes and the barracks must also accept `item.stone`. Add a new armor type only with corresponding entries in every damage-multiplier row. A renamed ID requires updating every reference, including maps; no aliases are created.

## A scenario instance

A `.utcmap` placement refers to a definition, not a GLB filename:

```json
{
  "id": "ambush/north-vanguard",
  "definition": "unit.ants.vanguard",
  "owner": "player.2",
  "position": { "x": 90, "y": 85 },
  "rotation": 180,
  "initialState": { "health": 100 }
}
```

This instance starts damaged; its maximum HP still comes from the definition. The runtime allocates a numeric entity ID in stable authored-ID order. Moving the placement does not turn that ID into a different definition. Its map owner must have a player start. For a passive unowned object use `none`; aggression and direct control still require the relevant capability/policy.

Placing `unit.neutral.wolf` through Editor → Entities writes an explicit camp record too. Editing raw JSON requires adding its placement ID to exactly one camp's `members`, with `home`, `aggroRange`, `leash` and `aggression`. The neutral model name is never inspected to discover a camp.

## Another workshop

A sawmill definition lists `item.plank` as its automatic output and accepts `item.log`. The plank owns `creation.method = "craft"`, the one-log input and work ticks. The workshop owns storage capacity, work radius where relevant, staffing and the name shown for the assigned job. The worker remains `unit.ants.settler` with runtime employment.

To add another workshop using the same process, duplicate the building and give it its own ID, art, footprint, construction bill and production settings. Add its ID to the settlers' `work.builds` list. The engine performs construction, staffing and item production through the existing native verbs.

To introduce a genuinely new process, such as healing, follow [Adding a native behavior](systems.md#adding-a-native-behavior). JSON cannot supply executable conditions, change pathfinding algorithms, or call arbitrary engine functions.

## Commands are intentions

The command card binds an actor before enqueueing. For example, a recruitment intention carries `type: "produce"`, the selected barracks' runtime `actor` ID, and the output `definition` ID. It does not carry the price, worker ID to steal, result HP or a callback. Authoritative systems validate and resolve those details.

Future scenario scripting can enqueue supported intentions at a deterministic tick and consume structured facts. Spawn, ownership transfer, inventory, hero leveling and Lua bindings need their own explicit lifecycle contracts; they are not hidden capabilities of the current JSON format.

## Group construction commands

The shipped `build` action defaults to `"category": "category.build"`. To group a new building with the military structures, give its definition `"category": "category.build-advanced"`. To reorganize just one binding, add `"build:building.ants.house": { "category": "category.build-advanced" }` to `actions.overrides`; `"category": null` instead leaves that command at the root.

Declare a new menu in `actions.categories` with name, description, icon, priority and an optional unused hotkey. Give it `"parent": "category.build"` to nest it inside Build. Only populated menus render; authoring an empty category does not add a dead button. See the [category contract](behaviors.md#command-categories) for precedence and navigation rules.
