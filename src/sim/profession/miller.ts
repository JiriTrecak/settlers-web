/**
 * Miller cycle: rest inside the mill, take crop, grind, dump flour.
 */
import type { Movable } from "../movable/movable";
import { tickConverter } from "./converter";
import type { ProfessionContext } from "./profession";

export function tickMiller(m: Movable, ctx: ProfessionContext): void {
  tickConverter(m, ctx, { workplace: "mill", input: "crop", output: "flour" });
}
