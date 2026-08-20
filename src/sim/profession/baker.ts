/**
 * Baker cycle: rest inside, consume flour + water, dump bread.
 */
import type { Movable } from "../movable/movable";
import { tickKitchen } from "./kitchen";
import type { ProfessionContext } from "./profession";

export function tickBaker(m: Movable, ctx: ProfessionContext): void {
  tickKitchen(m, ctx, { workplace: "baker", output: "bread" });
}
