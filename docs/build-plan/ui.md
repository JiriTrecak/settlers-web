# UI

HTML/CSS overlay. Not Pixi.

## Purpose

`src/ui` is menus, HUD, selection panel, build menu, messages. It talks to the game only via `Action` and read-only view models.

Pixi is a canvas under this overlay. CSS `pointer-events` so the map receives drags, HUD receives clicks.

## Public API (target)

```ts
class UiRoot {
  constructor(host: HTMLElement, hooks: UiHooks);
  setMode(mode: "boot" | "drop-assets" | "menu" | "loading" | "playing"): void;
  setPlaying(vm: PlayingViewModel): void;
}

type UiHooks = {
  onAction(action: Action): void;
  onPickMap?(id: string): void;
};

type PlayingViewModel = {
  selection: SelectionVm | null;
  player: PlayerVm;
  messages: readonly MessageVm[];
  speed: number;
  paused: boolean;
};
```

View models are plain data. UI does not query `World` directly.

## Phase 0

- `#hud` overlay in `index.html`
- A single status line so we know HTML sits on top of Pixi
- `src/ui` exports `Hud` and `Minimap` classes
- No menus, no buttons that do game things

## Phase 1

- Cursor coord readout (app/render push `{ x, y }` into HUD)
- Optional: zoom percent

## Phase 2

- Loading progress while graphics dump is fetched

## Phase 3

- Map list from dumped catalog
- Click to load

## Phase 4

- Pause / 1× / 2× / 4× / 8× under the minimap
- Nothing else. Don't build a control panel for one bearer.

## Phase 6+

Rebuild the original S3 side panel in HTML, feature by feature:

| Panel | Owns |
|---|---|
| Build menu | Categories + placeable buildings |
| Selection | People, soldiers, building |
| Goods | Inventory / distribution / priorities / production |
| Settlers | Stats / professions / warriors |
| Messages | Queue + content |
| Minimap chrome | The map itself may stay canvas |

Layout: look at original S3, then do a **clean HTML version**. Readable, keyboard-accessible, our art later.

Settings become a settings screen, not a secret flags file.

## Styling

- `src/ui/hud/styles.css` — one file until it hurts
- No UI framework in Phase 0–4. If the panel becomes hell, *then* consider Solid/Preact. Default is DOM.
- Don't draw buttons in Pixi.

## Refusals

- Putting HUD sprites into the landscape atlas.
- Reading `World` fields from click handlers. Always `Action` → app → sim.
