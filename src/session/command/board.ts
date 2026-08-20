/**
 * Resolves selection → command page and runs ids. Session owns verbs; this is the table + stack.
 */
import type { BuildingKind } from "../../sim/data/buildings";
import type { CommandId, CommandPage, SelectionView } from "../../ui/control/types";
import { blankPage, buildPage, buildingIcon, buildingLabel, foodPage, hutPage, idlePage, industryPage, FOOD, INDUSTRY, PLACEABLE, recruitPage, RECRUITABLE, toolsPage } from "./pages";
import type { BoardContext, PlaceTool } from "./types";

export type CommandBoardHooks = {
  armPlace(tool: PlaceTool | null): void;
  bumpDiggerRatio(delta: number): void;
  bumpBricklayerRatio(delta: number): void;
  destroySelected(): void;
  clearSelection(): void;
};

function rootOf(sel: BoardContext["selection"]): "idle" | "units" | "hut" {
  if (sel.type === "units") return "units";
  if (sel.type === "building") return "hut";
  return "idle";
}

function unitTitle(types: string[]): string {
  if (types.length === 0) return "Units";
  const first = types[0]!;
  if (types.every((t) => t === first)) {
    return types.length === 1 ? labelType(first) : `${labelType(first)} ×${types.length}`;
  }
  return `${types.length} units`;
}

function labelType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export class CommandBoard {
  private drill: "build" | "recruit" | "tools" | "industry" | "food" | null = null;
  private root: "idle" | "units" | "hut" = "idle";
  private ctx: BoardContext = {
    selection: { type: "none" },
    counts: {},
    units: {},
    canCommand: false,
    placeTool: null,
    diggerRatio: 0.25,
    diggerCap: 0,
    bricklayerRatio: 0.25,
    bricklayerCap: 0,
  };

  constructor(private readonly hooks: CommandBoardHooks) {}

  sync(ctx: BoardContext): void {
    const root = rootOf(ctx.selection);
    if (root !== this.root) {
      this.root = root;
      this.drill = null;
    }
    this.ctx = ctx;
  }

  /** Leave a drill page. True if the stack actually moved. */
  pop(): boolean {
    if (this.drill == null) return false;
    if (this.drill === "industry" || this.drill === "food") {
      this.drill = "build";
      return true;
    }
    this.drill = null;
    return true;
  }

  /**
   * Fire the enabled slot on the current page whose `hotkey` is `raw`.
   * Page-local — idle B is Build; L/F/S/W/H/T only exist on the build page.
   */
  key(raw: string): boolean {
    const k = raw.length === 1 ? raw.toLowerCase() : "";
    if (!k) return false;
    const slot = this.page.slots.find((s) => s?.enabled && s.hotkey === k);
    if (!slot) return false;
    this.invoke(slot.id);
    return true;
  }

  invoke(id: CommandId): void {
    if (id === "page.build") {
      if (this.root === "idle") this.drill = "build";
      return;
    }
    if (id === "page.industry") {
      if (this.root === "idle" && (this.drill === "build" || this.drill === "industry")) this.drill = "industry";
      return;
    }
    if (id === "page.food") {
      if (this.root === "idle" && (this.drill === "build" || this.drill === "food")) this.drill = "food";
      return;
    }
    if (id === "page.recruit") {
      if (this.root === "idle") this.drill = "recruit";
      return;
    }
    if (id === "page.tools") {
      if (this.root === "idle") this.drill = "tools";
      return;
    }
    if (id === "page.back") {
      if (!this.pop()) this.hooks.clearSelection();
      return;
    }
    if (id === "hut.destroy") {
      const sel = this.ctx.selection;
      if (this.ctx.canCommand && sel.type === "building" && sel.owned) this.hooks.destroySelected();
      return;
    }
    if (id === "hut.area") {
      const sel = this.ctx.selection;
      if (!this.ctx.canCommand || sel.type !== "building" || !sel.owned || !sel.workArea) return;
      this.hooks.armPlace(this.ctx.placeTool?.type === "workArea" ? null : { type: "workArea" });
      return;
    }
    if (id === "tools.digger.dec") {
      if (this.ctx.canCommand) this.hooks.bumpDiggerRatio(-1);
      return;
    }
    if (id === "tools.digger.inc") {
      if (this.ctx.canCommand) this.hooks.bumpDiggerRatio(1);
      return;
    }
    if (id === "tools.bricklayer.dec") {
      if (this.ctx.canCommand) this.hooks.bumpBricklayerRatio(-1);
      return;
    }
    if (id === "tools.bricklayer.inc") {
      if (this.ctx.canCommand) this.hooks.bumpBricklayerRatio(1);
      return;
    }
    const kind = parseBuild(id);
    if (kind) {
      if (!this.ctx.canCommand) return;
      const cur = this.ctx.placeTool;
      const next: PlaceTool | null =
        cur?.type === "building" && cur.kind === kind ? null : { type: "building", kind };
      this.hooks.armPlace(next);
      return;
    }
    const rec = parseRecruit(id);
    if (rec) {
      if (!this.ctx.canCommand) return;
      const cur = this.ctx.placeTool;
      const next: PlaceTool | null =
        cur?.type === "unit" && cur.kind === rec.kind && cur.count === rec.count
          ? null
          : { type: "unit", kind: rec.kind, count: rec.count };
      this.hooks.armPlace(next);
    }
  }

  get page(): CommandPage {
    if (this.root === "idle") {
      if (this.drill === "build") return buildPage(this.ctx);
      if (this.drill === "industry") return industryPage(this.ctx);
      if (this.drill === "food") return foodPage(this.ctx);
      if (this.drill === "recruit") return recruitPage(this.ctx);
      if (this.drill === "tools") return toolsPage(this.ctx);
      return idlePage(this.ctx);
    }
    if (this.root === "hut") return hutPage(this.ctx);
    return blankPage(this.root);
  }

  get selectionView(): SelectionView {
    const sel = this.ctx.selection;
    if (sel.type === "units") {
      const kinds: { kind: string; count: number }[] = [];
      for (const t of sel.types) {
        const row = kinds.find((k) => k.kind === t);
        if (row) row.count += 1;
        else kinds.push({ kind: t, count: 1 });
      }
      return { type: "units", title: unitTitle(sel.types), kinds };
    }
    if (sel.type === "building") {
      return {
        type: "building",
        title: buildingLabel(sel.kind),
        kind: sel.kind,
        state: sel.state,
        icon: buildingIcon(sel.kind),
      };
    }
    return { type: "none" };
  }
}

function parseBuild(id: CommandId): BuildingKind | null {
  if (!id.startsWith("build.")) return null;
  const kind = id.slice("build.".length);
  return PLACEABLE.some((p) => p.kind === kind) || INDUSTRY.some((p) => p.kind === kind) || FOOD.some((p) => p.kind === kind)
    ? (kind as BuildingKind)
    : null;
}

function parseRecruit(id: CommandId): (typeof RECRUITABLE)[number] | null {
  if (!id.startsWith("recruit.")) return null;
  const kind = id.slice("recruit.".length);
  return RECRUITABLE.find((p) => p.kind === kind) ?? null;
}
