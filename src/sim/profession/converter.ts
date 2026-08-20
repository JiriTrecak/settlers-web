/**
 * Indoor 1-in 1-out worker: rest, take the request, convert at the door / workSpot, drop.
 * Miller (crop→flour) and slaughterer (pig→meat). Sawmiller stays in its own file.
 */
import { buildingDef, type BuildingKind } from "../data/buildings";
import type { Goods } from "../data/types";
import type { Movable } from "../movable/movable";
import { canDeposit, STACK_SIZE } from "../object/object";
import { stackCount } from "../job/job";
import { beginRest, doorOf, goHome, readyAtHut, type ProfessionContext } from "./profession";

export function tickConverter(
  m: Movable,
  ctx: ProfessionContext,
  spec: { workplace: BuildingKind; input: Goods; output: Goods },
): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut || hut.kind !== spec.workplace) return;
  const def = buildingDef(hut.kind);
  const reqRel = def.requestStacks[0];
  const offRel = def.offerStacks[0];
  if (!reqRel || !offRel) return;
  const request = { x: hut.pos.x + reqRel.dx, y: hut.pos.y + reqRel.dy };
  const offer = { x: hut.pos.x + offRel.dx, y: hut.pos.y + offRel.dy };
  const spot = def.workSpot;
  const work = spot ? { x: hut.pos.x + spot.dx, y: hut.pos.y + spot.dy } : doorOf(hut);

  if (m.material === spec.output) {
    if (canDeposit(ctx.objects, offer, spec.output)) {
      beginRest(m, ctx.tickMs);
      m.assignJob({ type: "drop", at: offer });
    } else goHome(m, hut, ctx);
    return;
  }

  if (m.material === spec.input) {
    m.assignJob({ type: "saw", at: work });
    return;
  }

  if (!readyAtHut(m, hut, ctx)) return;
  if (stackCount(ctx.objects, request, spec.input) <= 0) return;
  if (stackCount(ctx.objects, offer, spec.output) >= STACK_SIZE) return;
  m.assignJob({ type: "pickup", at: request });
}
