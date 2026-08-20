/**
 * Indoor multi-input worker: rest, consume every request stack at the door, drop the output.
 * Baker (flour+water→bread) and pig farmer (crop+water→pig).
 */
import { buildingDef, type BuildingKind } from "../data/buildings";
import type { Goods } from "../data/types";
import type { Movable } from "../movable/movable";
import { canDeposit, STACK_SIZE } from "../object/object";
import { stackCount } from "../job/job";
import { beginRest, doorOf, goHome, readyAtHut, type ProfessionContext } from "./profession";

export function tickKitchen(m: Movable, ctx: ProfessionContext, spec: { workplace: BuildingKind; output: Goods }): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut || hut.kind !== spec.workplace) return;
  const def = buildingDef(hut.kind);
  const offRel = def.offerStacks[0];
  if (!offRel || def.requestStacks.length === 0) return;
  const offer = { x: hut.pos.x + offRel.dx, y: hut.pos.y + offRel.dy };

  if (m.material === spec.output) {
    if (canDeposit(ctx.objects, offer, spec.output)) {
      beginRest(m, ctx.tickMs);
      m.assignJob({ type: "drop", at: offer });
    } else goHome(m, hut, ctx);
    return;
  }

  if (!readyAtHut(m, hut, ctx)) return;
  if (stackCount(ctx.objects, offer, spec.output) >= STACK_SIZE) return;
  const consume = def.requestStacks.map((slot) => ({
    x: hut.pos.x + slot.dx,
    y: hut.pos.y + slot.dy,
    material: slot.material,
  }));
  if (consume.some((c) => stackCount(ctx.objects, c, c.material) <= 0)) return;
  beginRest(m, ctx.tickMs);
  m.assignJob({ type: "craft", at: doorOf(hut), output: spec.output, consume });
}
