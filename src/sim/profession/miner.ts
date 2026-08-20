/**
 * Miner cycle: rest inside the mine, pull one ore from a random blocked tile,
 * walk out and dump it on the offer. Empty deposit → rest again (no basket walk).
 * Food work-packages wait on bakeries.
 */
import type { BuildingDef } from "../data/types";
import { buildingDef } from "../data/buildings";
import type { ResourceKind } from "../map/resource";
import type { Movable } from "../movable/movable";
import { canDeposit, STACK_SIZE } from "../object/object";
import { stackCount } from "../job/job";
import { beginRest, goHome, readyAtHut, type ProfessionContext } from "./profession";

export function tickMiner(m: Movable, ctx: ProfessionContext): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut) return;
  const def = buildingDef(hut.kind);
  if (def.worker !== "miner" || !def.mine) return;
  const offRel = def.offerStacks[0];
  if (!offRel) return;
  const ore = offRel.material;
  const offer = { x: hut.pos.x + offRel.dx, y: hut.pos.y + offRel.dy };

  if (m.material === ore) {
    if (canDeposit(ctx.objects, offer, ore)) {
      beginRest(m, ctx.tickMs);
      m.assignJob({ type: "drop", at: offer });
    } else goHome(m, hut, ctx);
    return;
  }

  if (!readyAtHut(m, hut, ctx)) return;
  if (stackCount(ctx.objects, offer, ore) >= STACK_SIZE) return;
  if (!takeMineOre(hut.pos.x, hut.pos.y, def, ctx)) {
    beginRest(m, ctx.tickMs);
    return;
  }
  m.material = ore;
  beginRest(m, ctx.tickMs);
  m.assignJob({ type: "drop", at: offer });
}

function takeMineOre(ox: number, oy: number, def: BuildingDef, ctx: ProfessionContext): boolean {
  const kind = def.mine as ResourceKind | undefined;
  if (!kind || def.blocked.length === 0) return false;
  const rel = def.blocked[ctx.rng.nextInt(def.blocked.length)]!;
  return ctx.grid.takeResource(ox + rel.dx, oy + rel.dy, kind);
}
