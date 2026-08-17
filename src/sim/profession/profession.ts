/**
 * Profession brains. They assign jobs; `tickJob` still runs the verbs.
 */
import type { BuildingGrid } from "../building/building";
import type { JobContext } from "../job/job";
import type { Movable } from "../movable/movable";
import { tickLumberjack } from "./lumberjack";
import { tickSawmiller } from "./sawmiller";

export type ProfessionContext = JobContext & {
  buildings: BuildingGrid;
  tickMs: number;
};

export function tickProfession(m: Movable, ctx: ProfessionContext): void {
  if (m.type === "lumberjack") tickLumberjack(m, ctx);
  else if (m.type === "sawmiller") tickSawmiller(m, ctx);
}
