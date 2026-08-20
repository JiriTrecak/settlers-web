/**
 * Digger brain. Workplace is the current flatten plot (FIFO — construction
 * assigns jobs). Plot done / hut left plan → idle, keep the profession (pool).
 */
import { buildingDef } from "../data/buildings";
import { flattenReady, footprint } from "../building/flatten";
import type { Movable } from "../movable/movable";
import type { ProfessionContext } from "./profession";

export function tickDigger(m: Movable, ctx: ProfessionContext): void {
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut || hut.state !== "plan") {
    m.workplaceId = null;
    return;
  }
  const def = buildingDef(hut.kind);
  const tiles = footprint(def.protected, hut.pos);
  if (flattenReady(ctx.grid, tiles, hut.flattenHeight)) m.workplaceId = null;
}
