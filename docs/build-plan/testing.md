# Testing

Vitest from day one. The pipeline is real in Phase 0 even if coverage is a joke.

## Purpose

Sim is deterministic. That's the whole cheat code. Tests should pin rules so a rewrite of `PartitionManager` doesn't silently starve bakeries.

Render/Pixi: few tests. Visuals get eyeballed. Pure camera math **is** unit-tested.

## Layout

```
src/sim/**/*.test.ts      # colocated unit tests (preferred for sim)
src/shared/**/*.test.ts
tests/smoke.test.ts       # boot-level, architecture
tests/architecture.test.ts
```

- Vitest, Node environment for sim
- `happy-dom` or similar only if UI tests need DOM. Phase 0 smoke does not need to boot Pixi.
- No Playwright until we have something to click (Phase 4+). Don't add it empty.

Scripts:

```
npm test          # vitest run
npm run test:watch
npm run dev
npm run build
```

## Phase 0

Must exist and pass:

1. **Smoke** — `Clock` stub ticks: `tickIndex` goes 0 → 1
2. **Architecture** — every file under `src/sim/**` is read as text; fail if it contains `pixi.js` or `from "pixi.js"`. Cheap and vicious.
3. **RNG** — `seedRng(1)` twice produces the same sequence; does not call `Math.random`

That's it. No coverage threshold.

## Phase 1

- Camera: `screenToWorld` ∘ `worldToScreen` round-trip within a pixel for a handful of grid points
- `pick()` hits the tile we think it does (table of cases)
- Mesh builder: triangle count `=== width * height * 2` for a dummy grid (pure function, no Pixi)

## Phase 2

- DAT pointer-table parser against a **hand-authored** mini buffer (we write the bytes; not an S3 file in git)
- Bitmap decoder: a 1×1 or 2×2 hand-encoded frame → known RGBA
- `ImageRef` key stability: `original_10_SETTLER_3_2` round-trips

## Phase 3

- Original map crypt/segment reader against a tiny self-made fixture
- Landscape/height arrays have expected `width * height`

Do not check in Ubisoft/Blue Byte `.map` files.

## Phase 4

- Bearer: after N ticks, occupies neighbor tile
- `moveProgress` is 0 at start of step, increases, wraps
- `view().movables[0]` matches internal state
- Dispatch `moveTo` is the only way it walks (not a test reaching into internals and setting fields)

## Phase 5+

Port Java test **cases**, not JUnit classes:

| Java | Becomes |
|---|---|
| `BucketQueueAStarTest` | `src/sim/path/astar.test.ts` |
| `SimpleBehaviorTreeTest` | `src/sim/behavior/tree.test.ts` |
| `MaterialsManagerTest` | `src/sim/economy/materials.test.ts` |
| `PartitionsGridTest` | `src/sim/partition/grid.test.ts` |
| `ReplayValidationIT` | later: `tests/replay/*.test.ts` |

Replay north star: same seed + same action log ⇒ same checksum of world (material counts, unit positions hashed). Java replays are a bonus if we can parse them; our own format is the requirement.

## What not to test

- Pixi `Application` booting (fragile in CI)
- DAT decode of real S3 files in CI (no assets)
- Pixel-perfect screenshots in Phase 0–4
- Swing UI tests, obviously

## Architecture rules (keep adding)

Phase 0:

- `src/sim` must not import `pixi.js`

Add later:

- `src/sim` must not import `src/render`, `src/ui`, `src/app`
- `src/shared` must not import pixi / dom / other areas
- `Action` union exhaustiveness: a type-level test or a switch helper that `never`-checks

## Spec pointers

- `jsettlers.logic/src/test/java/` — cases
- `jsettlers.tests/` — integration
- `ReplayValidationIT.java`, `AutoReplayIT.java` — how they thought about correctness
