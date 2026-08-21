/**
 * Command tables. New buttons go here, not in the grid widget.
 * Idle is Tools / Recruit plus Production / Food / Military. Cards without
 * `kind` are catalog-only — shown at 50% and not placeable.
 */
import { buildingDef, buildings, type BuildingKind } from "../../sim/data/buildings";
import { settlerDef } from "../../sim/data/settlers";
import type { SettlerDef } from "../../sim/data/types";
import { COMMAND_CORNER, COMMAND_FOOD, COMMAND_MILITARY, COMMAND_NEAR_CORNER, COMMAND_PRODUCTION, COMMAND_SLOTS, COMMAND_TOOLS, type CommandPage, type CommandSlot } from "../../ui/control/types";
import { catalogPath } from "./catalog";
import type { BoardContext, CountPair, RecruitKind } from "./types";

const ROMAN = "buildings/roman";

/** One strip cell. `kind` set ⇒ sim can place it. */
export type BuildCard = {
  sheet: string;
  label: string;
  kind?: BuildingKind;
  hotkey?: string;
};

function card(folder: string, label: string, kind?: BuildingKind, hotkey?: string): BuildCard {
  return { sheet: `${ROMAN}/${folder}`, label, kind, hotkey };
}

/** Row: wood/store, mines + charcoal (Romans have no sulfur mine), smelters. Stonecutter rides with mines. */
export const PRODUCTION: BuildCard[] = [
  card("lumberjack", "Lumberjack", "lumberjack", "l"),
  card("stock", "Store"),
  card("sawmill", "Sawmill", "sawmill", "w"),
  card("forester", "Forester", "forester", "f"),
  card("coalmine", "Coal mine"),
  card("ironmine", "Iron mine", "ironmine", "i"),
  card("goldmine", "Gold mine", "goldmine", "g"),
  card("stonecutter", "Stonecutter", "stonecutter", "s"),
  card("ironmelt", "Iron smelter"),
  card("goldmelt", "Gold smelter"),
  card("toolsmith", "Toolmaker"),
];

/** Grain → bread, meat/fish, wine/donkeys, residences. */
export const FOOD: BuildCard[] = [
  card("farm", "Farm", "farm", "a"),
  card("mill", "Mill", "mill", "m"),
  card("baker", "Baker", "baker", "k"),
  card("waterworks", "Waterworks", "waterworks", "w"),
  card("pig_farm", "Pig farm", "pig_farm", "p"),
  card("slaughterhouse", "Slaughter", "slaughterhouse", "s"),
  card("fisher", "Fisher", "fisher", "i"),
  card("winegrower", "Winery"),
  card("donkey_farm", "Donkey farm"),
  card("small_livinghouse", "House", "small_livinghouse", "h"),
  card("medium_livinghouse", "Medium house"),
];

/** Towers, then barracks / smith / temples, then hospital + ships. */
export const MILITARY: BuildCard[] = [
  card("tower", "Tower", "tower", "t"),
  card("lookout_tower", "Lookout"),
  card("big_tower", "Big tower"),
  card("castle", "Castle"),
  card("barrack", "Barracks"),
  card("weaponsmith", "Weapon smith"),
  card("temple", "Temple"),
  card("big_temple", "Big temple"),
  card("hospital", "Hospital"),
  card("harbor", "Harbor"),
  card("dockyard", "Dockyard"),
];

const ALL_CARDS = [...PRODUCTION, ...FOOD, ...MILITARY];

/** Implemented huts that `build.*` may arm. */
export const PLACEABLE: BuildingKind[] = ALL_CARDS.map((c) => c.kind).filter((k): k is BuildingKind => k != null);

const LABELS: Record<string, string> = {};
for (const c of ALL_CARDS) {
  LABELS[c.sheet] = c.label;
  if (c.kind) LABELS[c.kind] = c.label;
}

export function buildingLabel(kind: string): string {
  return LABELS[kind] ?? kind.replace(/_/g, " ");
}

/** First `built` frame. Accepts a `BuildingKind` or a catalog sheet path. */
export function buildingIcon(kindOrSheet: string): string {
  const sheet =
    kindOrSheet in buildings ? buildingDef(kindOrSheet as BuildingKind).sheet : kindOrSheet;
  return catalogPath(sheet, "built") ?? `${sheet}/built.png`;
}

export function emptySlots(): (CommandSlot | null)[] {
  return Array.from({ length: COMMAND_SLOTS }, () => null);
}

/** Bottom-right. Drill pages say Back; hut says Cancel. Same id. */
function navCorner(label: string): CommandSlot {
  return { id: "page.back", label, enabled: true, kind: "page" };
}

export const RECRUITABLE: { kind: RecruitKind; label: string; count: number; hotkey?: string }[] = [
  { kind: "swordsman", label: "Swordsman", count: 1 },
  { kind: "pioneer", label: "Pioneer", count: 1, hotkey: "c" },
  { kind: "geologist", label: "Geologist", count: 1, hotkey: "g" },
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

function fillBuild(slots: (CommandSlot | null)[], cards: readonly BuildCard[], ctx: BoardContext): void {
  const armed = ctx.placeTool?.type === "building" ? ctx.placeTool.kind : null;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]!;
    const live = c.kind != null;
    slots[i] = {
      id: live ? `build.${c.kind}` : `locked.${c.sheet}`,
      label: c.label,
      icon: buildingIcon(c.sheet),
      ...(live ? badge(ctx.counts[c.kind]) : {}),
      enabled: live && ctx.canCommand,
      kind: "do",
      armed: live && armed === c.kind,
      hotkey: live ? c.hotkey : undefined,
    };
  }
}

export function idlePage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  const can = ctx.canCommand;
  slots[COMMAND_TOOLS] = {
    id: "page.tools",
    label: "Tools",
    icon: settlerIcon("digger"),
    enabled: can,
    kind: "page",
  };
  slots[COMMAND_NEAR_CORNER] = {
    id: "page.recruit",
    label: "Recruit",
    enabled: can,
    kind: "page",
  };
  slots[COMMAND_PRODUCTION] = {
    id: "page.production",
    label: "Production",
    icon: buildingIcon("lumberjack"),
    enabled: can,
    kind: "page",
    hotkey: "p",
  };
  slots[COMMAND_FOOD] = {
    id: "page.food",
    label: "Food",
    icon: buildingIcon("farm"),
    enabled: can,
    kind: "page",
    hotkey: "f",
  };
  slots[COMMAND_MILITARY] = {
    id: "page.military",
    label: "Military",
    icon: buildingIcon("tower"),
    enabled: can,
    kind: "page",
    hotkey: "m",
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

export function productionPage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  fillBuild(slots, PRODUCTION, ctx);
  slots[COMMAND_CORNER] = navCorner("Back");
  return { id: "production", slots };
}

export function foodPage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  fillBuild(slots, FOOD, ctx);
  slots[COMMAND_CORNER] = navCorner("Back");
  return { id: "food", slots };
}

export function militaryPage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  fillBuild(slots, MILITARY, ctx);
  slots[COMMAND_CORNER] = navCorner("Back");
  return { id: "military", slots };
}

export function recruitPage(ctx: BoardContext): CommandPage {
  const slots = emptySlots();
  const armed = ctx.placeTool?.type === "unit" ? ctx.placeTool : null;
  for (let i = 0; i < RECRUITABLE.length; i++) {
    const { kind, label, count, hotkey } = RECRUITABLE[i]!;
    slots[i] = {
      id: `recruit.${kind}`,
      label,
      icon: settlerIcon((settlerDef(kind) as SettlerDef).sheet ?? kind),
      ...badge(ctx.units[kind]),
      enabled: ctx.canCommand,
      kind: "do",
      armed: armed?.kind === kind && armed.count === count,
      hotkey,
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
