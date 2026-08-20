/**
 * Texture-load progress. `loadTexture` reports here while a watch is `run()`ning.
 * Session paints this through the overlay; render never touches DOM.
 */
export type LoadProgress = {
  stage: string;
  detail: string;
  done: number;
  total: number;
  last: string;
  ms: number;
};

let active: LoadWatch | null = null;

export function currentLoadWatch(): LoadWatch | null {
  return active;
}

export function loadNote(detail: string): void {
  active?.note(detail);
}

export async function loadYield(): Promise<void> {
  await active?.yield();
}

export class LoadWatch {
  private stage = "Loading";
  private detail = "";
  private last = "";
  private readonly expected = new Set<string>();
  private readonly ticked = new Set<string>();
  private readonly t0 = performance.now();

  constructor(private readonly emit: (view: LoadProgress) => void) {}

  /** Route `loadTexture` ticks into this watch until `fn` settles. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = active;
    active = this;
    this.flush();
    try {
      return await fn();
    } finally {
      if (active === this) active = prev;
    }
  }

  setStage(stage: string, detail = ""): void {
    this.stage = stage;
    this.detail = detail;
    this.flush();
  }

  note(detail: string): void {
    this.detail = detail;
    this.flush();
  }

  expectPath(path: string): void {
    if (this.expected.has(path)) return;
    this.expected.add(path);
    this.flush();
  }

  tick(path: string): void {
    this.expectPath(path);
    if (this.ticked.has(path)) return;
    this.ticked.add(path);
    this.last = path;
    this.flush();
  }

  /** Let the overlay paint before a long sync stretch (World construct). */
  async yield(): Promise<void> {
    this.flush();
    if (typeof requestAnimationFrame === "function") {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
  }

  view(): LoadProgress {
    return {
      stage: this.stage,
      detail: this.detail,
      done: this.ticked.size,
      total: this.expected.size,
      last: this.last,
      ms: performance.now() - this.t0,
    };
  }

  private flush(): void {
    this.emit(this.view());
  }
}
