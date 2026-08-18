/**
 * Digger brain. Workplace is the plan hut. Pick an unmarked protected tile
 * whose height is still off the frozen mean, walk onto it, kneel. Revert when
 * the plot is level or the hut leaves `plan`.
 */
import { buildingDef } from "../data/buildings";
import { flattenReady, footprint, nextFlattenTile } from "../building/flatten";
import type { Movable } from "../movable/movable";
import type { ProfessionContext } from "./profession";

export function tickDigger(m: Movable, ctx: ProfessionContext): void {
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut || hut.state !== "plan") {
    m.become("bearer", null, ctx.tickMs);
    return;
  }
  const def = buildingDef(hut.kind);
  const tiles = footprint(def.protected, hut.pos);
  if (flattenReady(ctx.grid, tiles, hut.flattenHeight)) {
    m.become("bearer", null, ctx.tickMs);
    return;
  }
  if (m.job || m.walking) return;
  const at = nextFlattenTile(ctx.grid, ctx.marks, tiles, hut.flattenHeight, ctx.rng);
  if (!at) return;
  m.assignJob({ type: "flatten", at, hutId: hut.id });
}
