/**
 * Bricklayer: hammer on a construction spot until the hut leaves `building`.
 * Pool member — plot gone / finished → idle, keep the profession.
 */
import { buildingDef } from "../data/buildings";
import type { Movable } from "../movable/movable";
import type { ProfessionContext } from "./profession";

export function tickBricklayer(m: Movable, ctx: ProfessionContext): void {
  if (m.job || m.walking) return;
  const hut = m.workplaceId != null ? ctx.buildings.get(m.workplaceId) : undefined;
  if (!hut || hut.state !== "building") {
    m.workplaceId = null;
    return;
  }
  const def = buildingDef(hut.kind);
  const spot = def.bricklayers.find((s) => hut.pos.x + s.dx === m.pos.x && hut.pos.y + s.dy === m.pos.y);
  if (!spot) return;
  m.assignJob({
    type: "build",
    at: { x: hut.pos.x + spot.dx, y: hut.pos.y + spot.dy },
    hutId: hut.id,
    direction: spot.direction,
  });
}
