import type { GameContext } from "./context";
import { fixed } from "./motion";
import { cell } from "./spatial";

/** Short, bounded idle strolls. Tick/ID hashing varies cadence without a random source. */
export function idleMotion(c: GameContext) {
  const occupied = new Set(c.activeUnits().map(cell));
  for (const e of c.activeUnits()) {
    const u = e.unit!;
    const busy = u.order || u.job || u.employment || u.cargo || u.pendingMove ||
      u.target || u.cooldown || u.returning || u.camp;
    if (!c.def(e).behaviors.work || !c.def(e).behaviors.movement?.idleWander || busy) {
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
    if (target.x < 0 || target.y < 0 || target.x > 255 || target.y > 255 ||
      (target.x === e.x && target.y === e.y) || occupied.has(cell(target))) continue;
    // Never wander through an obstacle or take a long detour.
    occupied.delete(cell(e));
    const clear = c.spatial.clearSegment(u.position ?? fixed(e), fixed(target), occupied);
    occupied.add(cell(e));
    if (clear && c.spatial.route(e, target)) u.idle.walking = true;
  }
}
