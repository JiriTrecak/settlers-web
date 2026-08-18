/**
 * Wall-clock buckets for one sim beat (or a sum of beats this frame).
 * Debug overlay only — never mixed into checksum / replay.
 */
export const TICK_PHASES = [
  "apply",
  "trees",
  "step",
  "houses",
  "profession",
  "construction",
  "matcher",
  "flock",
  "jobs",
  "land",
  "fog",
  "occ",
] as const;

export type TickPhase = (typeof TICK_PHASES)[number];
export type TickTimings = Record<TickPhase, number>;

export function emptyTickTimings(): TickTimings {
  return {
    apply: 0,
    trees: 0,
    step: 0,
    houses: 0,
    profession: 0,
    construction: 0,
    matcher: 0,
    flock: 0,
    jobs: 0,
    land: 0,
    fog: 0,
    occ: 0,
  };
}

/** Marks elapsed `performance.now()` into `into`. No-op when omitted so tests stay free. */
export class TickTimer {
  private t = 0;
  private readonly into: TickTimings | null;

  constructor(into?: TickTimings) {
    this.into = into ?? null;
    if (into) this.t = performance.now();
  }

  mark(phase: TickPhase): void {
    if (!this.into) return;
    const n = performance.now();
    this.into[phase] += n - this.t;
    this.t = n;
  }
}
