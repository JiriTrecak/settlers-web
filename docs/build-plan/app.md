# App

Composition root. Wires sim, render, assets, UI. Owns the browser loop. Owns "user dropped a folder."

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

- Vite entry: `index.html` → `src/app/main.ts`
- Create Pixi `Application`, `resizeTo: window`, dark background
- Mount canvas into `#game`
- Visible boot marker (e.g. a 64px rectangle) so we know it started
- `GameApp.start()` / `stop()`
- No folder-drop, no sim ticking, no camera

## Phase 1

- Construct `Renderer`, pass it the Pixi stage
- Synthetic `MapView` (hardcoded small grid) fed to renderer
- Pointer events: pan/zoom delegated to render; app only forwards

## Phase 2

- Folder-drop / `<input webkitdirectory>` / File System Access API for `GFX/`
- Hand files to `assets`
- Loading UI state: "drop your S3 GFX folder" vs "loading" vs "ready"
- Never upload files anywhere. All local.

## Phase 3

- Also accept `MAP/` (and later `SND/`)
- Map picker: list dropped `.map` files, load one into sim, give renderer the view

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

## Spec pointers

- [`jsettlers.logic/.../JSettlersGame.java`](../../../SettlersJava/jsettlers.logic/src/main/java/jsettlers/main/JSettlersGame.java) — load, run, tear down. Steal the lifecycle, not the thread soup.
- [`jsettlers.common/.../IMapInterfaceConnector.java`](../../../SettlersJava/jsettlers.common/src/main/java/jsettlers/common/menu/IMapInterfaceConnector.java) — sim ↔ UI. Becomes `UiBridge` events, not a 12-method interface.
- [`jsettlers.logic/.../GuiInterface.java`](../../../SettlersJava/jsettlers.logic/src/main/java/jsettlers/input/GuiInterface.java) — action dispatch. Becomes `InputRouter`. Discriminated unions, not instanceof chains.

## Refusals

- No `Thread`, no `synchronized`, no `stopMutex`.
- No static `MatchConstants.clock()`.
- No mixing rAF and sim ticks into one `update(dt)` that makes the economy frame-rate dependent.
- App does not decode DAT files or draw triangles. It delegates.
