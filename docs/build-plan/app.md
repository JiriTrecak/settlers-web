# App

Composition root. Wires sim, render, dumped graphics, UI. Owns the browser loop.

## Purpose

`src/app` is allowed to know about every other area. Nothing else is. If render needs a clock, app passes it. If UI needs to fire an action, app routes it into sim.

## Public API (target)

```ts
class GameApp {
  constructor(root: HTMLElement);
  start(): Promise<void>;
  stop(): void;
}

type GameLoop = {
  /** rAF. Renders latest snapshot. Never ticks sim. */
  onFrame(dtMs: number): void;
};
```

Sim ticks on its own schedule (Phase 4+: accumulator of 25ms). Render runs every animation frame and interpolates with `moveProgress`.

## Phase 0

- Vite entry: `index.html` → `src/app/boot/main.ts`
- Create Pixi `Application`, `resizeTo: window`, dark background
- Mount canvas into `#game`
- Visible boot marker so we know it started
- `GameApp.start()` / `stop()`
- No sim ticking, no camera

## Phase 1

- Construct `Renderer`, pass it the Pixi stage
- Synthetic `MapView` (hardcoded small grid) fed to renderer
- Pointer events: pan/zoom delegated to render; app only forwards

## Phase 2

- Load dumped graphics (atlas + catalog)
- Loading UI state: loading vs ready

## Phase 3

- Map picker from dumped catalog JSON
- Load one into sim, give renderer the view
- Loads are generation-guarded so a slow fetch can't clobber a newer selection

## Phase 4

- Own the loop:
  1. while accumulator ≥ 25ms: `clock.tick()`
  2. `snapshot = world.view()`
  3. `renderer.draw(snapshot)`
- Speed controls later; for now 1× realtime
- Pause = stop ticking, keep rendering

## Phase 5+

- Route UI/render input → `Action` → sim
- Replay recording hook (append actions + tick index)
- Multiplayer (Phase 12): same action pipe, lockstep delay

## Refusals

- Mixing rAF and sim ticks into one `update(dt)` that makes the economy frame-rate dependent.
- App does not decode DAT files or draw triangles. It delegates.
- App does not import `original_conv`.
