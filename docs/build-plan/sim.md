# Sim

Headless game. No Pixi. No DOM. Deterministic.

## Purpose

`src/sim` is the S3 rules: grid, movables, buildings, materials, combat, AI. The renderer sees a read-only view. Tests run this in Node.

## Public API (target)

```ts
class Clock {
  readonly tickMs: 25;
  readonly tickIndex: number;
  constructor(rng: Rng);
  tick(): void;
  onTick(fn: () => void): Unsubscribe;
}

class Game {
  constructor(config: MatchConfig, map: MapData);
  readonly world: World;
  readonly clock: Clock;
  dispatch(action: Action): void;
  view(): ViewSnapshot;
}

type GridPos = { readonly x: number; readonly y: number };

type MapView = {
  width: number;
  height: number;
  landscapeAt(x: number, y: number): LandscapeType;
  heightAt(x: number, y: number): number;
  movableAt(x: number, y: number): MovableView | null;
  objectsAt(x: number, y: number): readonly MapObjectView[];
  playerAt(x: number, y: number): PlayerId | null;
  isBorder(x: number, y: number): boolean;
  fowAt(x: number, y: number): number; // 0–100
};

type MovableView = {
  id: number;
  type: MovableType;
  pos: GridPos;
  direction: Direction;
  action: MovableAction;
  moveProgress: number; // [0, 1)
  material: Material;
  health: number;
  alive: boolean;
};

type ViewSnapshot = {
  tick: number;
  map: MapView;
  movables: readonly MovableView[];
};
```

`MapView` is the Java `IGraphicsGrid` contract, cleaned up. `objectsAt` returns an array, not a linked list.

`Action` is a discriminated union (Java `IAction` / `EActionType`). Start small in Phase 4 (`moveTo`), grow in 6+.

## Clock

Spec: [`RescheduleTimer.java`](../../../SettlersJava/jsettlers.logic/src/main/java/jsettlers/logic/timer/RescheduleTimer.java).

- 25ms slot
- Things schedule themselves `n` ms ahead
- One wheel of slots, not a heap (keep the algorithm — it's cache-friendly for "wake thousands of settlers")
- **No singleton.** `Game` owns `Clock`.
- RNG: `Rng` with `nextInt`, `nextFloat`, seed in `MatchConfig`. Every sim random goes through it.

Render interpolates; sim only sees integer ticks and `moveProgress` stored on the movable as a 0–1 float updated on tick (Java already does this).

## World split

Java `MainGrid` is a god object. Split:

| Module | Owns |
|---|---|
| `MapGrid` | landscape, height, resources, blocked, partitions id |
| `ObjectGrid` | trees, stones, stacks, flags, arrows |
| `MovableGrid` | who is on which tile |
| `BuildingList` | buildings |
| `PartitionManager` | materials, jobs, land (Phase 7) |
| `FogOfWar` | per-player vis (Phase 8) |

`World` is a facade that ticks subsystems in a fixed order.

Hot data is SoA typed arrays. See [conventions.md](conventions.md).

## Hex

6 directions. Deltas from Java `EDirection`:

```
NE (0, -1)  E (1, 0)  SE (1, 1)
SW (0, 1)   W (-1, 0) NW (-1, -1)
```

Keep that table. Pathfinding and building shapes depend on it.

## Phase 0

- `src/sim/index.ts` exports `Clock` stub: `tickIndex`, `tick()` increments it
- `src/sim/rng.ts` stub: `seedRng(seed: number): Rng` (mulberry32 or similar — **not** `Math.random`)
- `src/sim/types.ts` — `GridPos`, empty `Action` union (`{ type: "noop" }`)
- Zero Pixi imports
- No grid yet

## Phase 1

- Nothing required (render uses a synthetic view). Optional: `MapGrid` with landscape/height arrays and a `MapView` adapter, so render can already consume sim data. Prefer this if it's small — one source of truth early.

## Phase 3

- `MapData` parsed from original `.map`
- Spec: [`OriginalMapFileContentReader.java`](../../../SettlersJava/jsettlers.logic/src/main/java/jsettlers/logic/map/loading/original/OriginalMapFileContentReader.java) — encrypted segments, landscape, height, objects, start points
- Decoder in `src/sim/map/original/` using `DataView`. Port the crypt loop carefully; write tests against a fixture we generate, or golden values from running Java once and recording (don't check in copyrighted maps)

## Phase 4

- `World` with a grid
- One `Movable` of type `bearer`
- Walk: occupy next tile, `moveProgress` 0→1 over N ticks, then snap
- `dispatch({ type: "moveTo", id, to })` even if pathfinding is "straight / adjacent only"
- `view()` returns snapshot render can draw

## Phase 5

- Port A* (bucket queue). Spec: `BucketQueueAStar.java` + tests
- Behavior trees: rewrite as small TS functions/objects. Spec: `jsettlers/algorithms/simplebehaviortree`. Same node semantics (`sequence`, `selector`, `condition`, `action`, `wait`), not the Java visitor soup.
- Map objects: tree, stone, stack. `stateProgress` as in `IMapObject`

## Phase 6

- Buildings: place, flatten, construct, work radius
- Construction marks algorithm
- Spec: `jsettlers.logic/.../buildings/`, `jsettlers.common/.../buildings/`
- Building definitions: Java uses XML/enums. We use TypeScript data modules (`src/sim/data/buildings.ts`), not XML.

## Phase 7

- **The game.** `PartitionManager`, material requests, bearer jobs, distribution, priorities
- Spec: `jsettlers.logic/.../partition/manager/`
- Tests from `MaterialsManagerTest` etc. Re-express as Vitest. Same cases, our types.

## Phase 8–10

- FOW (`FogOfWar.java`)
- Combat / soldiers / specialists
- AI (`jsettlers.logic/.../ai/`) last. It is a player that emits `Action`s. Keep that. Internals can be rewritten more aggressively — Java AI is a pile of finders.

## Phase 12

- Lockstep: tick N waits until all players' actions for N arrived
- Spec: `jsettlers.network` conceptually, not the TCP framing
- Replay = log of `{ tick, player, action }[]` + seed + map id

## Spec pointers (logic)

- `JSettlersGame.java` — lifecycle
- `MainGrid.java` — what subsystems exist (read as a map, don't clone)
- `Movable.java` + `movable/` — unit state machines / BT roots
- `RescheduleTimer.java` — clock
- `IMapData.java` — loaded map
- `ReplayValidationIT.java` — **this is the north star.** When sim is mature, a Java replay should reproduce on our engine, or we record our own replays and checksum world state.

## Refusals

- Pixi, DOM, `window`, `performance.now` inside `src/sim`.
- `Math.random`, `Date.now` inside `src/sim`.
- Porting `MainGrid` as one 2k-line class.
- `short` / `byte` types. Use `number` + typed arrays.
- `synchronized`, `Thread`, `ObjectOutputStream`.
- Making the economy "simpler" in Phase 7. S3's bearer-job system **is** the game. Clean implementation, same rules.
