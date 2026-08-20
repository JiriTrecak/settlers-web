/**
 * Pig farmer cycle: rest inside, consume crop + water, dump a pig.
 */
import type { Movable } from "../movable/movable";
import { tickKitchen } from "./kitchen";
import type { ProfessionContext } from "./profession";

export function tickPigFarmer(m: Movable, ctx: ProfessionContext): void {
  tickKitchen(m, ctx, { workplace: "pig_farm", output: "pig" });
}
