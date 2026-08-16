# UI

HTML/CSS overlay. Not Pixi. Not Swing.

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
  onDropFolder?(files: FileList | FileSystemDirectoryHandle): void;
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
- A single status line: `Settlers — boot` (proves HTML sits on top of Pixi)
- `src/ui/index.ts` exports `mountHud(host: HTMLElement): void`
- No menus, no buttons that do game things

## Phase 1

- Cursor coord readout (app/render push `{ x, y }` into HUD)
- Optional: zoom percent

## Phase 2

- Drop zone / "Open GFX folder" button
- Error text if the folder isn't an S3 GFX dir (missing `siedler3_*.dat`)
- Loading progress (file N of M)

## Phase 3

- Map list from dropped `MAP/`
- Click to load

## Phase 4

- Pause / 1× (speed later)
- Nothing else. Don't build a control panel for one bearer.

## Phase 6+

Rebuild the original S3 side panel in HTML, feature by feature:

| Panel | Java spec |
|---|---|
| Build menu | `BuildingBuildContent.java`, `EBuildingsCategory.java` |
| Selection (people, soldiers, building) | `panel/selection/` |
| Goods inventory / distribution / priorities / production | `panel/content/material/` |
| Settlers stats / professions / warriors | `panel/content/settlers/` |
| Messages | `Messenger.java`, `MessageContent.java` |
| Minimap chrome | `minimap/` (the map itself may stay Pixi/canvas) |

Layout: look at original S3 and JSettlers, then do a **clean HTML version**, not a pixel-perfect Swing clone. Readable, keyboard-accessible, our art later.

`options.prp` flags (`all-ai`, `fixed-ai-type`, `locale`) become a settings screen, not a secret file.

## Styling

- `src/ui/styles.css` — one file until it hurts
- No UI framework in Phase 0–4. If the panel becomes hell, *then* consider Solid/Preact. Default is DOM.
- Don't draw buttons in Pixi.

## Spec pointers

- `jsettlers.graphics/.../map/controls/original/` — what the panel *contains*, not how to paint it
- `IMapInterfaceConnector.java` — `setSelection`, `scrollTo`, `playSound`
- `EActionType.java` — the action vocabulary to re-express as our `Action` union
- `jsettlers.main.swing/.../menu/` — start/join/load menus (we'll have a simpler start screen)

## Refusals

- Porting `UIPanel`, `go.graphics` regions, or the layout builder.
- Putting HUD sprites into the landscape atlas.
- Reading `World` fields from click handlers. Always `Action` → app → sim.
- A settings `.prp` parser.
