/**
 * Command tables. New buttons go here, not in the grid widget.
 */
import { buildingDef, type BuildingKind } from "../../sim/data/buildings";
import { settlerDef } from "../../sim/data/settlers";
import { COMMAND_CORNER, COMMAND_NEAR_CORNER, COMMAND_SLOTS, type CommandPage, type CommandSlot } from "../../ui/control/types";
import { catalogPath } from "./catalog";
import type { BoardContext } from "./types";

export const PLACEABLE: { kind: BuildingKind; label: string }[] = [
  { kind: "lumberjack", label: "Lumberjack" },
  { kind: "forester", label: "Forester" },
  { kind: "stonecutter", label: "Stonecutter" },
  { kind: "sawmill", label: "Sawmill" },
  { kind: "small_livinghouse", label: "House" },
  { kind: "tower", label: "Tower" },
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

export const RECRUITABLE: { kind: "swordsman"; label: string; count: number }[] = [
  { kind: "swordsman", label: "Swordsman", count: 1 },
];

/** First idle SE frame — same file the renderer loads. */
export function settlerIcon(sheet: string): string {
  const group = `settlers/roman/${sheet}/idle/none/se`;
  return catalogPath(group) ?? `${group}/000.png`;
}

export function idlePage(canCommand: boolean): CommandPage {
  const slots = emptySlots();
  slots[COMMAND_NEAR_CORNER] = {
    id: "page.recruit",
    label: "Recruit",
    enabled: canCommand,
    kind: "page",
  };
  slots[COMMAND_CORNER] = {
    id: "page.build",
    label: "Build",
    enabled: canCommand,
    kind: "page",
  };
  return { id: "idle", slots };
}

export function buildPage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  const armed = ctx.placeTool?.type === "building" ? ctx.placeTool.kind : null;
  for (let i = 0; i < PLACEABLE.length; i++) {
    const { kind, label } = PLACEABLE[i]!;
    slots[i] = {
      id: `build.${kind}`,
      label,
      icon: buildingIcon(kind),
      count: ctx.counts[kind] ?? 0,
      enabled: ctx.canCommand,
      kind: "do",
      armed: armed === kind,
    };
  }
  slots[COMMAND_CORNER] = {
    id: "page.back",
    label: "Back",
    enabled: true,
    kind: "page",
  };
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
      count: ctx.units[kind] ?? 0,
      enabled: ctx.canCommand,
      kind: "do",
      armed: armed?.kind === kind && armed.count === count,
    };
  }
  slots[COMMAND_CORNER] = {
    id: "page.back",
    label: "Back",
    enabled: true,
    kind: "page",
  };
  return { id: "recruit", slots };
}

export function blankPage(id: string): CommandPage {
  return { id, slots: emptySlots() };
}
