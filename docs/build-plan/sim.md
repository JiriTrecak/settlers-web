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

`objectsAt` returns an array. `Action` is a discriminated union. Start small in Phase 4 (`moveTo`), grow in 6+.

## Clock

- 25ms slot
- Things schedule themselves `n` ms ahead
- One wheel of slots, not a heap (cache-friendly for "wake thousands of settlers")
- **No singleton.** `Game` owns `Clock`.
- RNG: `Rng` with `nextInt`, `nextFloat`, seed in `MatchConfig`. Every sim random goes through it.

Render interpolates; sim only sees integer ticks and `moveProgress` stored on the movable as a 0–1 float updated on tick.

## World split

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

6 directions. Deltas in `shared`:

```
NE (0, -1)  E (1, 0)  SE (1, 1)
SW (0, 1)   W (-1, 0) NW (-1, -1)
```

Keep that table. Pathfinding and building shapes depend on it.

## Maps

Engine loads dumped JSON (`DumpedMap`): landscape type names, scaled heights, trees with `sheet`, stones with `capacity`. Original `.map` parsing is `original_conv` only.

Waves are generated at load from water neighbors (`waveDecorations`). Trees/stones come from the dump.

## Phase 0

- `Clock` stub: `tickIndex`, `tick()` increments it
- `seedRng(seed: number): Rng` (mulberry32 or similar — **not** `Math.random`)
- `GridPos`, empty `Action` union (`{ type: "noop" }`)
- Zero Pixi imports
- No grid yet

## Phase 1

- Nothing required (render uses a synthetic view). Optional: `MapGrid` with landscape/height arrays and a `MapView` adapter.

## Phase 3

- `DumpedMap` ingested into `MapGrid` + decorations
- Tests against dumped fixtures we generate; don't check in copyrighted original maps

## Phase 4

- `World` with a grid
- One `Movable` of type `bearer`
- Walk: occupy next tile, `moveProgress` 0→1 over N ticks, then snap
- `dispatch({ type: "moveTo", id, to })` even if pathfinding is "straight / adjacent only"
- `view()` returns snapshot render can draw

## Phase 5

- A* (bucket queue)
- Behavior trees as small TS functions/objects. Node semantics: `sequence`, `selector`, `condition`, `action`, `wait`.
- Map objects: tree, stone, stack. `stateProgress` on objects

## Phase 6

- Buildings: place, flatten, construct, work radius
- Construction marks algorithm
- Building definitions as TypeScript data modules (`src/sim/data/buildings.ts`)

## Phase 7

- **The game.** `PartitionManager`, material requests, bearer jobs, distribution, priorities
- Same cases as our economy tests. Same rules.

## Phase 8–10

- FOW
- Combat / soldiers / specialists
- AI last. It is a player that emits `Action`s.

## Phase 12

- Lockstep: tick N waits until all players' actions for N arrived
- Replay = log of `{ tick, player, action }[]` + seed + map id

## Refusals

- Pixi, DOM, `window`, `performance.now` inside `src/sim`.
- `Math.random`, `Date.now` inside `src/sim`.
- One 2k-line god class for the world.
- Making the economy "simpler" in Phase 7. S3's bearer-job system **is** the game. Clean implementation, same rules.
