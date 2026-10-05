/** A short fade with duplicate activation and destruction guards. */
export class MenuTransition {
  private animation: Animation | null = null;
  private disposed = false;
  constructor(private readonly root: HTMLElement) {}

  run(change: () => void): void {
    if (this.disposed || this.animation) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      change();
      return;
    }
    this.root.inert = true;
    const animation = this.root.animate([{opacity: 1}, {opacity: 0}], {
      duration: 180, easing: 'ease-in', fill: 'forwards',
    });
    this.animation = animation;
    void animation.finished.then(() => {
      if (this.disposed) return;
      this.animation = null;
      this.root.inert = false;
      change();
      animation.cancel();
      if (!this.disposed) {
        this.root.inert = false;
        this.root.animate([{opacity: 0}, {opacity: 1}], {duration: 300, easing: 'ease-out'});
      }
    }).catch(() => { /* Cancellation on screen disposal is expected. */ });
  }

  destroy(): void {
    this.disposed = true;
    this.animation?.cancel();
    this.animation = null;
  }
}
