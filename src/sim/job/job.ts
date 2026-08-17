/**
 * A unit's assignment. Movable only walks/works; `tickJob` is the verb.
 */
import type { GridPos } from "../../shared";
import type { MapGrid } from "../map/mapGrid";
import type { Movable } from "../movable/movable";
import { isAdjacent, type ObjectGrid } from "../object/object";
import { standBeside, type Blockers } from "../path/path";

export type Job = { type: "chop"; at: GridPos };

/** Chop duration: 1.8s at 25ms. */
export const CHOP_TICKS = 72;

export type JobContext = {
  grid: MapGrid;
  objects: ObjectGrid;
  blockers: Blockers;
};

export function workTicksOf(job: Job | null): number {
  return job?.type === "chop" ? CHOP_TICKS : 1;
}

export function tickJob(m: Movable, ctx: JobContext): void {
  const job = m.job;
  if (!job) return;
  if (job.type === "chop") tickChop(m, job.at, ctx);
}

function tickChop(m: Movable, target: GridPos, ctx: JobContext): void {
  const tree = ctx.objects.get(target.x, target.y);
  if (!tree || tree.kind !== "tree") {
    m.idle();
    return;
  }
  if (isAdjacent(m.pos, target) && !m.walking) {
    m.face(target);
    if (m.action !== "work") {
      m.beginWork();
      m.workElapsed = 0;
    }
    m.workElapsed += 1;
    tree.stateProgress = Math.max(0, 1 - m.workElapsed / CHOP_TICKS);
    if (m.workElapsed >= CHOP_TICKS) {
      ctx.objects.remove(target.x, target.y);
      m.idle();
    }
    return;
  }
  if (m.walking) return;
  const stand = standBeside(ctx.grid, target, m.pos, ctx.blockers);
  if (!stand) {
    m.idle();
    return;
  }
  m.pathTo(ctx.grid, stand, ctx.blockers);
}
