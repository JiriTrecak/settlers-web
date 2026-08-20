/**
 * Match-start overlay. Session pushes `LoadView`; this only paints it.
 */
export type LoadView = {
  stage: string;
  detail: string;
  done: number;
  total: number;
  last: string;
  ms: number;
};

export class LoadStatus {
  private readonly root: HTMLDivElement;
  private readonly stageEl: HTMLDivElement;
  private readonly detailEl: HTMLDivElement;
  private readonly countEl: HTMLDivElement;
  private readonly fillEl: HTMLDivElement;
  private readonly lastEl: HTMLDivElement;
  private readonly timeEl: HTMLDivElement;
  private pending: LoadView | null = null;
  private raf = 0;
  private destroyed = false;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "load-status";
    this.root.setAttribute("role", "status");
    this.root.setAttribute("aria-live", "polite");

    const panel = document.createElement("div");
    panel.className = "load-panel";
    const title = document.createElement("div");
    title.className = "load-title";
    title.textContent = "Loading";
    this.stageEl = document.createElement("div");
    this.stageEl.className = "load-stage";
    this.detailEl = document.createElement("div");
    this.detailEl.className = "load-detail";
    this.countEl = document.createElement("div");
    this.countEl.className = "load-count";
    const bar = document.createElement("div");
    bar.className = "load-bar";
    this.fillEl = document.createElement("div");
    this.fillEl.className = "load-bar-fill";
    bar.append(this.fillEl);
    this.lastEl = document.createElement("div");
    this.lastEl.className = "load-last";
    this.timeEl = document.createElement("div");
    this.timeEl.className = "load-time";
    panel.append(title, this.stageEl, this.detailEl, this.countEl, bar, this.lastEl, this.timeEl);
    this.root.append(panel);
    host.append(this.root);
  }

  set(view: LoadView): void {
    this.pending = view;
    if (this.destroyed) return;
    if (typeof requestAnimationFrame !== "function") {
      this.paint(view);
      return;
    }
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (this.pending) this.paint(this.pending);
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.root.remove();
  }

  private paint(view: LoadView): void {
    this.stageEl.textContent = view.stage;
    this.detailEl.textContent = view.detail;
    this.detailEl.hidden = !view.detail;
    if (view.total > 0) {
      this.countEl.hidden = false;
      this.countEl.textContent = `${view.done} / ${view.total} assets`;
      this.fillEl.style.width = `${Math.min(100, (100 * view.done) / view.total)}%`;
    } else {
      this.countEl.hidden = true;
      this.countEl.textContent = "";
      this.fillEl.style.width = "0%";
    }
    this.lastEl.textContent = view.last;
    this.lastEl.hidden = !view.last;
    this.timeEl.textContent = formatMs(view.ms);
  }
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}
