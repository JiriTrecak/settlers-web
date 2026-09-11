import {World} from "../../sim/world/world";
import type {UtcMap} from "../../shared/map/utcmap";
import type {LocalSave} from "../../shared/save/localSave";
/** Validate a complete snapshot before the running scenario is destroyed. */
export function restoreSavedWorld(save:LocalSave,map:UtcMap):World {
    const restored = new World({
      map: map,
      slots: save.match.slots,
      seed: save.seed,
    });
    restored.restore(save.world);
    const tick = restored.clock.tickIndex,
      players = save.match.slots.map((s) => s.player).sort((a, b) => a - b),
      pipeline = save.pipeline;
    if (
      pipeline.committed < tick ||
      pipeline.commits.length !== pipeline.committed - tick ||
      pipeline.commits.some(
        (c, i) =>
          c.tick !== tick + i + 1 ||
          c.slots.length !== players.length ||
          c.slots.some((s, j) => s.player !== players[j]),
      ) ||
      save.clients.length !== players.length ||
      new Set(save.clients.map((c) => c.player)).size !== players.length ||
      save.clients.some((c) => !players.includes(c.player)) ||
      pipeline.held.some(
        (h) => h.tick <= pipeline.committed || !players.includes(h.player),
      ) ||
      pipeline.through.length !== players.length ||
      new Set(pipeline.through.map((p) => p.player)).size !== players.length ||
      pipeline.through.some((p) => !players.includes(p.player))
    )
      throw new Error("Invalid saved command pipeline");
    return restored;
}
