/**
 * Flatten a sim snapshot into debug overlay numbers. Session owns the frame extras (fps, speed).
 */
import type { GridPos } from "../../shared";
import type { ViewSnapshot } from "../../sim/world/world";
import type { BuildingKind } from "../../sim/data/buildings";
import type { SettlerKind } from "../../sim/data/settlers";
import type { Goods } from "../../sim/data/types";

const SETTLERS: SettlerKind[] = ["bearer", "bricklayer", "lumberjack", "sawmiller"];
const BUILDINGS: BuildingKind[] = ["tower", "small_livinghouse", "lumberjack", "sawmill"];
const GOODS: Goods[] = ["trunk", "plank", "stone", "axe", "hammer", "blade", "pick", "saw"];
const ACTIONS = ["idle", "walk", "work"] as const;
const JOBS = ["chop", "pickup", "drop", "deliver", "saw", "occupy", "build"] as const;

export type DebugFrame = {
  fps: number;
  dtMs: number;
  speed: number;
  simPerFrame: number;
  simCapped: boolean;
  accMs: number;
  zoom: number;
  mapW: number;
  mapH: number;
  tool: string | null;
  selected: GridPos | null;
};

export type DebugStats = DebugFrame & {
  tick: number;
  settlers: Record<SettlerKind, number>;
  settlerTotal: number;
  actions: Record<(typeof ACTIONS)[number], number>;
  jobs: Record<(typeof JOBS)[number] | "none", number>;
  inside: number;
  carry: Record<Goods | "none", number>;
  buildings: Record<BuildingKind, { plan: number; building: number; built: number }>;
  buildingTotal: number;
  objects: { tree: number; stone: number; stack: number };
  stacks: Record<Goods, { piles: number; items: number }>;
};

export function debugFrom(snap: ViewSnapshot, frame: DebugFrame): DebugStats {
  const settlers = zero(SETTLERS);
  const actions = zero(ACTIONS);
  const jobs = { ...zero(JOBS), none: 0 };
  const carry = { ...zero(GOODS), none: 0 };
  let inside = 0;
  for (const m of snap.movables) {
    settlers[m.type] += 1;
    actions[m.action] += 1;
    if (m.job) jobs[m.job] += 1;
    else jobs.none += 1;
    carry[m.material] += 1;
    if (m.inside) inside += 1;
  }

  const buildings = Object.fromEntries(BUILDINGS.map((k) => [k, { plan: 0, building: 0, built: 0 }])) as DebugStats["buildings"];
  for (const b of snap.buildings) {
    const slot = buildings[b.kind] ?? (buildings[b.kind] = { plan: 0, building: 0, built: 0 });
    if (b.state === "plan") slot.plan += 1;
    else if (b.state === "building") slot.building += 1;
    else slot.built += 1;
  }

  const objects = { tree: 0, stone: 0, stack: 0 };
  const stacks = Object.fromEntries(GOODS.map((g) => [g, { piles: 0, items: 0 }])) as DebugStats["stacks"];
  for (const o of snap.objects) {
    objects[o.kind] += 1;
    if (o.kind !== "stack" || !o.material) continue;
    const s = stacks[o.material] ?? (stacks[o.material] = { piles: 0, items: 0 });
    s.piles += 1;
    s.items += o.capacity;
  }

  return {
    ...frame,
    tick: snap.tick,
    settlers,
    settlerTotal: snap.movables.length,
    actions,
    jobs,
    inside,
    carry,
    buildings,
    buildingTotal: snap.buildings.length,
    objects,
    stacks,
  };
}

export function formatDebug(d: DebugStats): string {
  const lines = [
    `${d.fps.toFixed(0)} fps   ${d.dtMs.toFixed(1)} ms   ${d.speed}×${d.simCapped ? "   CAPPED" : ""}`,
    `sim   tick ${d.tick}   ${d.simPerFrame}/frame   acc ${d.accMs.toFixed(0)} ms`,
    "",
    `settlers  ${d.settlerTotal}   inside ${d.inside}`,
    `  ${pairs(SETTLERS.map((k) => [k, d.settlers[k]]))}`,
    `  ${pairs(ACTIONS.map((k) => [k, d.actions[k]]))}`,
    `  job  ${pairs([...JOBS.map((k) => [k, d.jobs[k]] as const), ["none", d.jobs.none]])}`,
    `  carry  ${pairs([...GOODS.map((k) => [k, d.carry[k]] as const), ["none", d.carry.none]])}`,
    "",
    `buildings  ${d.buildingTotal}`,
    `  ${BUILDINGS.map((k) => fmtHut(k, d.buildings[k])).filter(Boolean).join("   ") || "—"}`,
    "",
    `objects  tree ${d.objects.tree}   stone ${d.objects.stone}   stack ${d.objects.stack}`,
    `  ${GOODS.map((g) => fmtStack(g, d.stacks[g])).filter(Boolean).join("   ") || "—"}`,
    "",
    `map  ${d.mapW}×${d.mapH}   zoom ${d.zoom.toFixed(2)}`,
    `tool  ${d.tool ?? "—"}   sel  ${fmtPos(d.selected)}`,
  ];
  return lines.join("\n");
}

function zero<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

function pairs(items: readonly (readonly [string, number])[]): string {
  const bits = items.filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`);
  return bits.length > 0 ? bits.join("   ") : "—";
}

function fmtHut(kind: string, slot: { plan: number; building: number; built: number } | undefined): string {
  if (!slot || (slot.plan === 0 && slot.building === 0 && slot.built === 0)) return "";
  const name = kind === "small_livinghouse" ? "house" : kind;
  const bits: string[] = [];
  if (slot.built) bits.push(String(slot.built));
  if (slot.building) bits.push(`${slot.building} building`);
  if (slot.plan) bits.push(`${slot.plan} plan`);
  return `${name} ${bits.join("+")}`;
}

function fmtStack(material: string, s: { piles: number; items: number } | undefined): string {
  if (!s || s.piles === 0) return "";
  return `${material} ${s.piles}/${s.items}`;
}

function fmtPos(pos: GridPos | null): string {
  return pos ? `${pos.x}, ${pos.y}` : "—";
}
