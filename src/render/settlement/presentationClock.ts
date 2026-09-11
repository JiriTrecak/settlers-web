/** Advance at most one unconfirmed simulation tick, then wait for the next observation. */
export class PresentationClock {
  private observed: number | null = null;
  private phase = 0;
  private time = 0;

  sample(tick: number, now: number, speed: number) {
    const elapsed = Math.max(0, (now - this.time) / 1000);
    const reset = this.observed === null || tick < this.observed;
    const previous = this.phase;
    if (reset || tick !== this.observed) this.phase = tick;
    else this.phase = Math.min(tick + .999, this.phase + elapsed * 40 * speed);
    this.observed = tick;
    this.time = now;
    return {
      tick: this.phase,
      delta: reset ? 0 : Math.max(0, this.phase - previous) / 40,
      // Transforms still need to settle onto the last authoritative position during a stall.
      smoothingDelta: reset ? 0 : Math.min(.1, elapsed) * speed,
    };
  }
}
