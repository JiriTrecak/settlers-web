/** Exponentially settles wheel input in log zoom space, independent of frame rate. */
export class ZoomMomentum {
  private pending = 0;
  reset() { this.pending = 0; }
  push(pixels: number) {
    if (!Number.isFinite(pixels) || pixels === 0) return;
    if (pixels * this.pending < 0) this.reset();
    // One conventional 100-pixel notch changes the eventual zoom by about 4%.
    this.pending = Math.max(-0.3, Math.min(0.3, this.pending + pixels * 0.0004));
  }
  step(dtMs: number) {
    if (!Number.isFinite(dtMs) || dtMs <= 0 || this.pending === 0) return 1;
    const change = this.pending * (1 - Math.exp(-Math.min(dtMs, 50) / 140));
    this.pending -= change;
    const tail = Math.abs(this.pending) < 0.00001 ? this.pending : 0;
    if (tail) this.reset();
    return Math.exp(change + tail);
  }
}
