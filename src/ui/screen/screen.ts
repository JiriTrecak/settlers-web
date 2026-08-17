/**
 * Overlay screens. `ScreenHost` mounts exactly one `GameScreen` at a time.
 */
export abstract class GameScreen {
  readonly root: HTMLElement
  private escape: ((e: KeyboardEvent) => void) | null = null;

  constructor(className = "screen") {
    this.root = document.createElement("div");
    this.root.className = className;
  }

  tick(_dtMs: number, _nowMs: number): void {}

  destroy(): void {
    if (this.escape) window.removeEventListener("keydown", this.escape);
    this.escape = null;
    this.root.remove();
  }

  protected onEscape(fn: () => void): void {
    this.escape = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", this.escape);
  }
}

/** Parent that holds the current screen. `show` destroys the previous one first. */
export class ScreenHost {
  private current: GameScreen | null = null;

  constructor(private readonly parent: HTMLElement) {}

  get screen(): GameScreen | null {
    return this.current;
  }

  show(next: GameScreen): void {
    this.current?.destroy();
    this.parent.replaceChildren();
    this.parent.append(next.root);
    this.current = next;
  }

  clear(): void {
    this.current?.destroy();
    this.current = null;
    this.parent.replaceChildren();
  }

  tick(dtMs: number, nowMs: number): void {
    this.current?.tick(dtMs, nowMs);
  }
}
