export class Clock {
  readonly tickMs = 25 as const;
  tickIndex = 0;

  tick(): void {
    this.tickIndex += 1;
  }
}
