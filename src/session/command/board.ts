/**
 * Resolves selection → command page and runs ids. Session owns verbs; this is the table + stack.
 */
import type { BuildingKind } from "../../sim/data/buildings";
import type { CommandId, CommandPage, SelectionView } from "../../ui/control/types";
import { blankPage, buildPage, buildingIcon, buildingLabel, idlePage, PLACEABLE, recruitPage, RECRUITABLE } from "./pages";
import type { BoardContext, PlaceTool } from "./types";

export type CommandBoardHooks = {
  armPlace(tool: PlaceTool | null): void;
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
  private drill: "build" | "recruit" | null = null;
  private root: "idle" | "units" | "hut" = "idle";
  private ctx: BoardContext = {
    selection: { type: "none" },
    counts: {},
    units: {},
    canCommand: false,
    placeTool: null,
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
    this.drill = null;
    return true;
  }

  invoke(id: CommandId): void {
    if (id === "page.build") {
      if (this.root === "idle") this.drill = "build";
      return;
    }
    if (id === "page.recruit") {
      if (this.root === "idle") this.drill = "recruit";
      return;
    }
    if (id === "page.back") {
      this.pop();
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
      if (this.drill === "recruit") return recruitPage(this.ctx);
      return idlePage(this.ctx.canCommand);
    }
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
  return PLACEABLE.some((p) => p.kind === kind) ? (kind as BuildingKind) : null;
}

function parseRecruit(id: CommandId): (typeof RECRUITABLE)[number] | null {
  if (!id.startsWith("recruit.")) return null;
  const kind = id.slice("recruit.".length);
  return RECRUITABLE.find((p) => p.kind === kind) ?? null;
}
