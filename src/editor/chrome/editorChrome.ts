/**
 * Editor overlay docks. Name + file on top, tools left, mode flyout beside a latched tool.
 */
import { IconBar } from "../../ui";
import type { CatalogEntry, GridMode } from "../../shared";
import { AssetChip } from "./assetChip";
import { BrushDock, type BrushDockHooks, type BrushDockState } from "./brushDock";
import { CameraHint } from "./cameraHint";
import { CleanDock, type CleanDockHooks, type CleanDockState } from "./cleanDock";
import { SelectDock, type SelectDockHooks, type SelectDockState } from "./selectDock";
import { McpDock, type McpDockHooks, type McpDockState } from "./mcpDock";
import { SculptDock, type SculptDockHooks, type SculptDockState } from "./sculptDock";
import { SkyDock, type SkyDockHooks } from "./skyDock";
import { EditorFileBar } from "./fileBar";
import { gameTools, type FileToolHooks, type GameToolHooks } from "./tools";
import type { SkyState } from "../../render/sky/sky";

export type EditorChromeHooks = FileToolHooks &
  GameToolHooks &
  BrushDockHooks &
  CleanDockHooks &
  SelectDockHooks &
  SculptDockHooks &
  McpDockHooks &
  SkyDockHooks & {
    onName(name: string): void;
  };

export class EditorChrome {
  private readonly rail: HTMLElement;
  private readonly file: EditorFileBar;
  private readonly game: IconBar;
  private readonly modes: IconBar;
  private readonly brush: BrushDock;
  private readonly clean: CleanDock;
  private readonly select: SelectDock;
  private readonly sculpt: SculptDock;
  private readonly mcp: McpDock;
  private readonly sky: SkyDock;
  private readonly chip: AssetChip;
  private readonly hint: CameraHint;

  constructor(host: HTMLElement, hooks: EditorChromeHooks) {
    this.file = new EditorFileBar(host, hooks);
    this.rail = document.createElement("div");
    this.rail.className = "editor-tool-rail pointer-events-none absolute left-4 top-1/2 z-10 flex -translate-y-1/2 flex-row items-center gap-1.5";
    host.append(this.rail);
    this.game = new IconBar(this.rail, { place: "col", label: "Tools", items: gameTools(hooks) });
    this.modes = new IconBar(this.rail, { place: "col", label: "Modes", items: this.game.modesOf("grid") });
    this.select = new SelectDock(this.rail, hooks);
    this.brush = new BrushDock(this.rail, hooks);
    this.clean = new CleanDock(this.rail, hooks);
    this.sculpt = new SculptDock(this.rail, hooks);
    this.mcp = new McpDock(this.rail, hooks);
    this.sky = new SkyDock(this.rail, hooks);
    this.chip = new AssetChip(host, { onOpen: hooks.onCatalogue });
    this.hint = new CameraHint(host);
  }

  setTool(id: string | null): void {
    this.game.setActive(id);
  }

  /** Grid latch = submenu open, not line visibility. */
  setGridMenu(on: boolean): void {
    this.game.setLatch("grid", on);
    this.modes.setOpen(on);
  }

  setGridMode(mode: GridMode): void {
    this.modes.setActive(mode === "none" ? null : mode);
  }

  setGameCam(on: boolean): void {
    this.game.setLatch("play", on);
    this.hint.setGame(on);
  }

  setSelectOpen(on: boolean): void {
    this.select.setOpen(on);
  }

  setSelect(state: SelectDockState): void {
    this.select.set(state);
  }

  setBrushOpen(on: boolean): void {
    this.brush.setOpen(on);
  }

  setBrush(state: BrushDockState): void {
    this.brush.set(state);
  }

  setCleanOpen(on: boolean): void {
    this.clean.setOpen(on);
  }

  setClean(state: CleanDockState): void {
    this.clean.set(state);
  }

  setSculptOpen(on: boolean): void {
    this.sculpt.setOpen(on);
  }

  setSculpt(state: SculptDockState): void {
    this.sculpt.set(state);
  }

  setMcpOpen(on: boolean): void {
    this.game.setLatch("mcp", on);
    this.mcp.setOpen(on);
  }

  setMcp(state: McpDockState): void {
    this.mcp.set(state);
  }

  setSkyOpen(on: boolean): void {
    this.game.setLatch("sky", on);
    this.sky.setOpen(on);
  }

  setEnvironmentOpen(on:boolean):void {this.game.setLatch("sky",on);}

  setSky(state: SkyState): void {
    this.sky.set(state);
  }

  setAsset(asset: CatalogEntry | null): void {
    this.chip.set(asset);
  }

  setName(name: string): void {
    this.file.setName(name);
  }

  setDirty(dirty: boolean): void {
    this.file.setDirty(dirty);
  }

  destroy(): void {
    this.file.destroy();
    this.game.destroy();
    this.modes.destroy();
    this.select.destroy();
    this.brush.destroy();
    this.clean.destroy();
    this.sculpt.destroy();
    this.mcp.destroy();
    this.sky.destroy();
    this.chip.destroy();
    this.hint.destroy();
    this.rail.remove();
  }
}
