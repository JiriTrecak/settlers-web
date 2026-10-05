import type { GameContext } from "./context";
import { fixed } from "./motion";


/** Short, bounded idle strolls. Tick/ID hashing varies cadence without a random source. */
export function idleMotion(c: GameContext) {
  const units=c.activeUnits(),occupiedByMode=new Map<boolean,Set<number>>();
  for (const e of units) {
    const u = e.unit!,definition=c.def(e);
    const busy = u.order || u.orderQueue.length || u.job || u.employment || u.cargo || u.pendingMove ||
      u.target || u.cooldown || u.returning || u.camp;
    if (!definition.behaviors.work || !definition.behaviors.movement?.idleWander || busy) {
      if (u.idle?.walking) { u.route = []; u.segment = null; u.goal = null; }
      u.idle = null;
      continue;
    }
    if (u.route.length) continue;
    const seed = (Math.imul(e.id, 73856093) ^ Math.imul(c.state.tick, 19349663)) >>> 0;
    const wait = 240 + seed % 241; // 6–12 seconds at 40 Hz.
    if (!u.idle) {
      u.idle = {home: {x: e.x, y: e.y}, nextTick: c.state.tick + wait, walking: false};
      continue;
    }
    if (u.idle.walking) {
      u.idle.walking = false;
      u.idle.nextTick = c.state.tick + wait;
    }
    if (c.state.tick < u.idle.nextTick) continue;
    u.idle.nextTick = c.state.tick + wait;
    const home = u.idle.home;
    const target = {x: home.x + seed % 3 - 1, y: home.y + Math.floor(seed / 3) % 3 - 1};
    if (target.x < 0 || target.y < 0 || target.x >= c.spatial.size || target.y >= c.spatial.size ||
      (target.x === e.x && target.y === e.y)) continue;
    // Usually no idle worker is due to stroll this tick. Resolve body modes and
    // collect occupancy only when there is an actual candidate to test. This
    // pass assigns routes but never moves bodies, so the set remains current.
    const air=c.spatial.airborne(e);let occupied=occupiedByMode.get(air);
    if(!occupied){occupied=new Set();for(const unit of units)if(c.spatial.airborne(unit)===air)occupied.add(c.spatial.cell(unit));occupiedByMode.set(air,occupied);}
    if(occupied.has(c.spatial.cell(target)))continue;
    // Never wander through an obstacle or take a long detour.
    occupied.delete(c.spatial.cell(e));
    const clear = c.spatial.clearSegment(u.position ?? fixed(e), fixed(target), occupied, e);
    occupied.add(c.spatial.cell(e));
    if (clear && c.spatial.route(e, target)) u.idle.walking = true;
  }
}
