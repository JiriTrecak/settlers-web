/**
 * Command tables. New buttons go here, not in the grid widget.
 */
import { buildingDef, type BuildingKind } from "../../sim/data/buildings";
import { settlerDef } from "../../sim/data/settlers";
import { COMMAND_CORNER, COMMAND_NEAR_CORNER, COMMAND_SLOTS, COMMAND_TOOLS, type CommandPage, type CommandSlot } from "../../ui/control/types";
import { catalogPath } from "./catalog";
import type { BoardContext, CountPair } from "./types";

export const PLACEABLE: { kind: BuildingKind; label: string; hotkey: string }[] = [
  { kind: "lumberjack", label: "Lumberjack", hotkey: "l" },
  { kind: "forester", label: "Forester", hotkey: "f" },
  { kind: "stonecutter", label: "Stonecutter", hotkey: "s" },
  { kind: "sawmill", label: "Sawmill", hotkey: "w" },
  { kind: "small_livinghouse", label: "House", hotkey: "h" },
  { kind: "tower", label: "Tower", hotkey: "t" },
];

const LABELS = Object.fromEntries(PLACEABLE.map((p) => [p.kind, p.label])) as Record<string, string>;

export function buildingLabel(kind: string): string {
  return LABELS[kind] ?? kind;
}

/** First `built` frame. One-frame dumps are `built.png`; tower is `built/00.png`. */
export function buildingIcon(kind: BuildingKind): string {
  const sheet = buildingDef(kind).sheet;
  return catalogPath(sheet, "built") ?? `${sheet}/built.png`;
}

export function emptySlots(): (CommandSlot | null)[] {
  return Array.from({ length: COMMAND_SLOTS }, () => null);
}

/** Bottom-right. Drill pages say Back; hut says Cancel. Same id. */
function navCorner(label: string): CommandSlot {
  return { id: "page.back", label, enabled: true, kind: "page" };
}

export const RECRUITABLE: { kind: "swordsman"; label: string; count: number }[] = [
  { kind: "swordsman", label: "Swordsman", count: 1 },
];

/** First idle SE frame — same file the renderer loads. */
export function settlerIcon(sheet: string): string {
  const group = `settlers/roman/${sheet}/idle/none/se`;
  return catalogPath(group) ?? `${group}/000.png`;
}

/** Hide 0/0. `have → queued` only when something is still in flight. */
function badge(pair: CountPair | undefined): Pick<CommandSlot, "count" | "queued"> {
  if (!pair) return {};
  const queued = pair.queued;
  if (pair.have === 0 && queued === 0) return {};
  if (queued !== pair.have) return { count: pair.have, queued };
  return { count: pair.have };
}

function toolBadge(pair: CountPair | undefined, cap: number): Pick<CommandSlot, "count" | "queued"> {
  const have = pair?.have ?? 0;
  const inflight = pair?.queued ?? have;
  return badge({ have, queued: Math.max(inflight, cap) });
}

function toolRow(
  slots: (CommandSlot | null)[],
  start: number,
  kind: "digger" | "bricklayer",
  label: string,
  ctx: BoardContext,
  ratio: number,
  cap: number,
): void {
  const can = ctx.canCommand;
  slots[start] = {
    id: `tools.${kind}.dec`,
    label: "Fewer",
    enabled: can && ratio > 0,
    kind: "do",
  };
  slots[start + 1] = {
    id: `tools.${kind}`,
    label,
    icon: settlerIcon(kind),
    ...toolBadge(ctx.units[kind], cap),
    enabled: false,
    kind: "do",
  };
  slots[start + 2] = {
    id: `tools.${kind}.inc`,
    label: "More",
    enabled: can && ratio < 1,
    kind: "do",
  };
}

export function idlePage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  slots[COMMAND_TOOLS] = {
    id: "page.tools",
    label: "Tools",
    icon: settlerIcon("digger"),
    enabled: ctx.canCommand,
    kind: "page",
  };
  slots[COMMAND_NEAR_CORNER] = {
    id: "page.recruit",
    label: "Recruit",
    enabled: ctx.canCommand,
    kind: "page",
  };
  slots[COMMAND_CORNER] = {
    id: "page.build",
    label: "Build",
    enabled: ctx.canCommand,
    kind: "page",
    hotkey: "b",
  };
  return { id: "idle", slots };
}

export function toolsPage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  toolRow(slots, 0, "digger", "Digger", ctx, ctx.diggerRatio, ctx.diggerCap);
  toolRow(slots, 4, "bricklayer", "Bricklayer", ctx, ctx.bricklayerRatio, ctx.bricklayerCap);
  slots[COMMAND_CORNER] = navCorner("Back");
  return { id: "tools", slots };
}

export function buildPage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  const armed = ctx.placeTool?.type === "building" ? ctx.placeTool.kind : null;
  for (let i = 0; i < PLACEABLE.length; i++) {
    const { kind, label, hotkey } = PLACEABLE[i]!;
    slots[i] = {
      id: `build.${kind}`,
      label,
      icon: buildingIcon(kind),
      ...badge(ctx.counts[kind]),
      enabled: ctx.canCommand,
      kind: "do",
      armed: armed === kind,
      hotkey,
    };
  }
  slots[COMMAND_CORNER] = navCorner("Back");
  return { id: "build", slots };
}

export function recruitPage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  const armed = ctx.placeTool?.type === "unit" ? ctx.placeTool : null;
  for (let i = 0; i < RECRUITABLE.length; i++) {
    const { kind, label, count } = RECRUITABLE[i]!;
    slots[i] = {
      id: `recruit.${kind}`,
      label,
      icon: settlerIcon(settlerDef(kind).sheet ?? kind),
      ...badge(ctx.units[kind]),
      enabled: ctx.canCommand,
      kind: "do",
      armed: armed?.kind === kind && armed.count === count,
    };
  }
  slots[COMMAND_CORNER] = navCorner("Back");
  return { id: "recruit", slots };
}

export function hutPage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  const owned = ctx.selection.type === "building" && ctx.selection.owned;
  const workArea = ctx.selection.type === "building" && ctx.selection.workArea;
  slots[0] = {
    id: "hut.destroy",
    label: "Delete",
    enabled: ctx.canCommand && owned,
    kind: "do",
  };
  if (workArea) {
    slots[1] = {
      id: "hut.area",
      label: "Area",
      enabled: ctx.canCommand && owned,
      kind: "toggle",
      armed: ctx.placeTool?.type === "workArea",
    };
  }
  slots[COMMAND_CORNER] = navCorner("Cancel");
  return { id: "hut", slots };
}

export function blankPage(id: string): CommandPage {
  return { id, slots: emptySlots() };
}
