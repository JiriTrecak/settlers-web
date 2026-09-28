import type { GameContext } from "./context";
import { fixed } from "./motion";

/** Nudges idle solid bodies out of each other. Overlaps arise from spawns, garrison releases,
 * revivals and ghost workers turning solid; WC3 pushes such units apart instead of leaving
 * them stacked. Movers already escape through `unitSegmentClear`'s separating-motion rule,
 * so only parked units are handled here, each checked every 20 ticks (staggered by id). */
export function separateOverlaps(c: GameContext) {
  for (const e of c.activeUnits()) {
    const u = e.unit!;
    if ((c.state.tick + e.id) % 20 || u.route.length || u.order || u.job || u.target || u.garrison ||
      !c.def(e).behaviors.movement || c.spatial.ignoresUnits(e)) continue;
    const at = u.position ?? fixed(e);
    if (c.spatial.unitSegmentClear(at, at, e.id)) continue;
    const spot = c.spatial.nearest(e, 3, e.id, e);
    if (spot) c.spatial.route(e, spot, false);
  }
}
