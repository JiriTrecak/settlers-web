/**
 * Roman waterworker. Walks to nearby water, fills a bucket, dumps it on the offer.
 */
import type { SettlerDef } from "../types";

export const waterworker = {
  kind: "waterworker",
  stepMs: 450,
  restMs: 3000,
  chopMs: 1000,
  workplace: "waterworks",
} as const satisfies SettlerDef;
