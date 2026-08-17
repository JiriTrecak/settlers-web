/** Fixed-step sim clock. `tickMs` is the canonical dt; `tickIndex` is the beat. */
export class Clock {
  readonly tickMs = 25 as const;
  tickIndex = 0;

  tick(): void {
    this.tickIndex += 1;
  }
}
