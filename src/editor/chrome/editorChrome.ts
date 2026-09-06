/**
 * Editor overlay docks. Name + file on top, tools left, mode flyout beside a latched tool.
 */
import { IconBar, sheet } from "../../ui";
import type { CatalogEntry, GridMode } from "../../shared";
import { AssetChip } from "./assetChip";
import { BrushDock, type BrushDockHooks, type BrushDockState } from "./brushDock";
import { CameraHint } from "./cameraHint";
import { CleanDock, type CleanDockHooks, type CleanDockState } from "./cleanDock";
import { SelectDock, type SelectDockHooks, type SelectDockState } from "./selectDock";
import { McpDock, type McpDockHooks, type McpDockState } from "./mcpDock";
import { SculptDock, type SculptDockHooks, type SculptDockState } from "./sculptDock";
import { DocTitle } from "./docTitle";
import { fileTools, gameTools, type FileToolHooks, type GameToolHooks } from "./tools";

export type EditorChromeHooks = FileToolHooks &
  GameToolHooks &
  BrushDockHooks &
  CleanDockHooks &
  SelectDockHooks &
  SculptDockHooks &
  McpDockHooks & {
    onName(name: string): void;
  };

export class EditorChrome {
  private readonly top: HTMLElement;
  private readonly rail: HTMLElement;
  private readonly title: DocTitle;
  private readonly file: IconBar;
  private readonly game: IconBar;
  private readonly modes: IconBar;
  private readonly brush: BrushDock;
  private readonly clean: CleanDock;
  private readonly select: SelectDock;
  private readonly sculpt: SculptDock;
  private readonly mcp: McpDock;
  private readonly chip: AssetChip;
  private readonly hint: CameraHint;

  constructor(host: HTMLElement, hooks: EditorChromeHooks) {
    this.top = document.createElement("div");
    this.top.className = `pointer-events-auto absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-2xl p-1.5 ${sheet}`;
    host.append(this.top);
    this.title = new DocTitle(this.top, { onName: hooks.onName });
    const rule = document.createElement("div");
    rule.setAttribute("role", "separator");
    rule.className = "mx-0.5 h-7 w-px bg-white/[0.08]";
    this.top.append(rule);
    this.file = new IconBar(this.top, { place: "inline", label: "File", items: fileTools(hooks), surface: "plain" });
    this.rail = document.createElement("div");
    this.rail.className = "pointer-events-none absolute left-4 top-1/2 z-10 flex -translate-y-1/2 flex-row items-center gap-1.5";
    host.append(this.rail);
    this.game = new IconBar(this.rail, { place: "col", label: "Tools", items: gameTools(hooks) });
    this.modes = new IconBar(this.rail, { place: "col", label: "Modes", items: this.game.modesOf("grid") });
    this.select = new SelectDock(this.rail, hooks);
    this.brush = new BrushDock(this.rail, hooks);
    this.clean = new CleanDock(this.rail, hooks);
    this.sculpt = new SculptDock(this.rail, hooks);
    this.mcp = new McpDock(this.rail, hooks);
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
    this.game.setLatch("gamecam", on);
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

  setAsset(asset: CatalogEntry | null): void {
    this.chip.set(asset);
  }

  setName(name: string): void {
    this.title.setName(name);
  }

  setDirty(dirty: boolean): void {
    this.title.setDirty(dirty);
  }

  destroy(): void {
    this.title.destroy();
    this.file.destroy();
    this.game.destroy();
    this.modes.destroy();
    this.select.destroy();
    this.brush.destroy();
    this.clean.destroy();
    this.sculpt.destroy();
    this.mcp.destroy();
    this.chip.destroy();
    this.hint.destroy();
    this.top.remove();
    this.rail.remove();
  }
}
