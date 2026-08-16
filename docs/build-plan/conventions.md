# Conventions

Java is a spec. TypeScript is the language we actually write. If a Java type is ugly, the TS version is the one they should have written.

## Style

- ESM. `strict`. No `any`. No `as unknown as`.
- Interfaces for contracts. No abstract-class pyramids.
- Properties, not JavaBean getters: `movable.action`, not `getAction()`.
- `readonly` on view types the renderer sees.
- Discriminated unions for actions, not `IAction` + `getActionType()` + instanceof.
- Const objects + union types instead of Java enums. Numeric S3 ids live in adapters, not in the domain API.
- Typed arrays for grids (`Uint8Array`, `Int8Array`, `Uint16Array`). Not `number[][]`.
- No Hungarian (`I`, `E`, `m_`). No `J` prefix. No `jsettlers` in our names.
- File names: `camelCase.ts` for modules, `PascalCase.ts` only if the file is exactly one class/type of that name. Prefer one concept per file.

## Names we keep

Domain words that mean something in S3: `Movable`, `Bearer`, `Pioneer`, `Partition`, `Landscape`, `FogOfWar`, `Manna`. Keep them.

## Java → TypeScript

| Java | TypeScript | Notes |
|---|---|---|
| `JSettlersGame` | `Game` | |
| `MainGrid` | split: `World`, `MapGrid`, `ObjectGrid`, … | God class. Do not port as one file. |
| `IGraphicsGrid` | `MapView` | Read-only snapshot/query the renderer uses. |
| `IGraphicsMovable` | `MovableView` | |
| `IMapObject` | `MapObjectView` | Linked-list `getNextObject()` becomes an array. |
| `IMapInterfaceConnector` | `UiBridge` | Sim → UI notifications. |
| `IAction` / `EActionType` | `Action` union | `{ type: "build"; building: BuildingType; at: GridPos }` |
| `RescheduleTimer` | `Clock` | 25ms slots. Same semantics, not the same code. |
| `ShortPoint2D` | `GridPos` | `{ readonly x: number; readonly y: number }` |
| `RelativePoint` | `GridDelta` | |
| `ELandscapeType` | `LandscapeType` | String union. S3 tile ids in `s3/landscapeIds.ts`. |
| `EMovableType` | `MovableType` | |
| `EDirection` | `Direction` | 6 hex dirs. Keep the delta table from Java. |
| `EMaterialType` | `Material` | |
| `EBuildingType` | `BuildingType` | |
| `EMapObjectType` | `MapObjectType` | |
| `ECivilisation` | `Civilization` | American spelling, one word, no `s`. |
| `ImageLink` | `ImageRef` | `{ file: number; kind: "settler" \| "gui" \| "landscape"; sequence: number; frame: number }` |
| `DatFileReader` | `DatFile` | |
| `SettlerImageMap` | `settlerSprites` | Lookup fn, not a 5D array class. |
| `GuiInterface` | `InputRouter` | Actions in, sim commands out. |
| `MatchConstants` | `MatchConfig` | Plain object, injected. No process-wide mutable statics. |
| `CommonConstants` | `config` | |
| `Player` | `Player` | Fine. |
| `FogOfWar` | `FogOfWar` | Fine. |
| `BucketQueueAStar` | `AStar` | Keep the bucket-queue algorithm. |
| `PartitionManager` | `PartitionManager` | Fine, but internals get split. |

## Things we never port

- `MutableInt` / `MutableBoolean` / `Mutable<T>` — just return values or close over a let.
- `DoubleLinkedList`, `ArrayListSet`, `ArrayListMap` — `Set`, `Map`, arrays.
- `Serializable`, `ObjectInputStream`, `serialVersionUID` — our own snapshot format when we need one.
- `IFoo` / `EFoo` prefixes.
- Package `jsettlers.*`. Ours is `src/{app,render,assets,sim,ui,shared}`.
- `go.graphics`, Swing, Android, LWJGL.
- Static singletons (`ImageProvider.getInstance()`, `RescheduleTimer.get()`). Inject.
- `Thread.sleep` "until serializer finishes".
- Checked exceptions. Throw or return `Result`. Prefer fail-loud in sim.
- Java `Random` as a hidden global. `Rng` interface, seeded, injected into `Clock` / `MatchConfig`.

## Numbers that look Java-y but stay

S3 and the remake use specific constants. We keep the **values**, not the class they lived in.

- Tick: `25` ms (`Clock.tickMs`)
- Iso: `tileWidth = 16`, `tileHeight = 9` (Java `DrawConstants.DISTANCE_X/Y`)
- Height displacement: `0` x, `2` y per height unit
- Landscape atlas: `1024`, grid `32` (Java `Background`)
- FOW: visible `100`, explored `50`, dim start `30`
- Hex: 6 directions, deltas from `EDirection`

Integer grid coords stay integers. JS numbers are safe for this (well below 2^53). Do not introduce float grid positions in sim. Interpolation (`moveProgress ∈ [0, 1)`) is view-only.

## Enum ordinals

Java enums are ordered and that order is baked into `.map` files and DAT indices. **Never** use TS enum numeric auto-increment as a file format.

Pattern:

```ts
export type LandscapeType = "grass" | "desert" | "mountain" | /* ... */;

export const landscapeS3Id: Record<LandscapeType, number> = {
  grass: 0,
  desert: 18,
  // ...
};
```

Domain code talks `LandscapeType`. Loaders/savers talk S3 ids.

## Data layout

Hot grids are SoA, not arrays of objects:

```ts
height: Int8Array;       // width * height
landscape: Uint8Array;   // index into LandscapeType table
blocked: Uint8Array;
player: Uint8Array;      // 255 = none
fow: Uint8Array;
```

Index: `i = y * width + x`. Same as a sane C port, unlike Java's `object[x][y]` cache-unfriendly default.

## Imports

```
sim    → shared, nothing else
assets → shared
render → shared, assets, pixi.js
ui     → shared
app    → everything
```

`shared` has types and pure functions only. No Pixi. No DOM.
