# Conventions

TypeScript is what we write. Types should be the ones this codebase actually wants.

## Style

- ESM. `strict`. No `any`. No `as unknown as`.
- Interfaces for contracts. No abstract-class pyramids.
- Properties, not getters: `movable.action`, not `getAction()`.
- `readonly` on view types the renderer sees.
- Discriminated unions for actions.
- Const objects + union types instead of numeric enums. Original S3 ids live in `original_conv` adapters, not in the domain API.
- Typed arrays for grids (`Uint8Array`, `Int8Array`, `Uint16Array`). Not `number[][]`.
- No Hungarian (`I`, `E`, `m_`).
- File names: `camelCase.ts` for modules, `PascalCase.ts` only if the file is exactly one class/type of that name. Prefer one concept per file.

## Names we keep

Domain words that mean something in S3: `Movable`, `Bearer`, `Pioneer`, `Partition`, `Landscape`, `FogOfWar`, `Manna`. Keep them.

## Types

| Type | Notes |
|---|---|
| `Game` | Match lifecycle |
| `World` | Facade over grid / objects / movables / buildings |
| `MapView` | Read-only snapshot/query the renderer uses |
| `MovableView` | |
| `MapObjectView` | Array of objects on a tile, not a linked list |
| `UiBridge` | Sim → UI notifications |
| `Action` union | `{ type: "build"; building: BuildingType; at: GridPos }` |
| `Clock` | 25ms slots |
| `GridPos` | `{ readonly x: number; readonly y: number }` |
| `GridDelta` | |
| `LandscapeType` | String union. Original tile ids stay in conversion. |
| `MovableType` | |
| `Direction` | 6 hex dirs. Delta table in `shared`. |
| `Material` | |
| `BuildingType` | |
| `MapObjectType` | |
| `Civilization` | American spelling, one word, no `s`. |
| `ImageRef` | `{ file: number; kind: "settler" \| "gui" \| "landscape"; sequence: number; frame: number }` |
| `settlerSprites` | Lookup fn |
| `InputRouter` | Actions in, sim commands out |
| `MatchConfig` | Plain object, injected. No process-wide mutable statics. |
| `AStar` | Bucket-queue algorithm |
| `PartitionManager` | Internals get split |

## Things we never do

- Mutable box types — just return values or close over a let.
- Homegrown list/set/map — `Set`, `Map`, arrays.
- `IFoo` / `EFoo` prefixes.
- Static singletons. Inject.
- Hidden global RNG. `Rng` interface, seeded, injected into `Clock` / `MatchConfig`.

## Constants

- Tick: `25` ms (`Clock.tickMs`)
- Iso: `tileWidth = 16`, `tileHeight = 9`
- Height displacement: `0` x, `2` y per height unit
- Landscape atlas: `1024`, grid `32`
- FOW: visible `100`, explored `50`, dim start `30`
- Hex: 6 directions, deltas in `shared`

Integer grid coords stay integers. JS numbers are safe for this (well below 2^53). Do not introduce float grid positions in sim. Interpolation (`moveProgress ∈ [0, 1)`) is view-only.

## File format ids

Original `.map` bytes and DAT indices are ordered tables. **Never** use TS enum numeric auto-increment as a file format.

Pattern:

```ts
export type LandscapeType = "grass" | "desert" | "mountain" | /* ... */;

export const landscapeS3Id: Record<LandscapeType, number> = {
  grass: 0,
  desert: 18,
  // ...
};
```

Domain code talks `LandscapeType`. Loaders/savers talk original ids. Conversion owns that mapping.

## Data layout

Hot grids are SoA, not arrays of objects:

```ts
height: Int8Array;       // width * height
landscape: Uint8Array;   // index into LandscapeType table
blocked: Uint8Array;
player: Uint8Array;      // 255 = none
fow: Uint8Array;
```

Index: `i = y * width + x`. Row-major.

## Imports

```
sim    → shared, nothing else
render → shared, pixi.js
ui     → shared
app    → everything in src
original_conv → may import src types; src never imports original_conv
```

`shared` has types and pure functions only. No Pixi. No DOM.
