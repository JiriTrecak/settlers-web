/**
 * Slaughterer cycle: rest inside, take a pig, work, dump meat.
 */
import type { Movable } from "../movable/movable";
import { tickConverter } from "./converter";
import type { ProfessionContext } from "./profession";

export function tickSlaughterer(m: Movable, ctx: ProfessionContext): void {
  tickConverter(m, ctx, { workplace: "slaughterhouse", input: "pig", output: "meat" });
}
