/**
 * Glass confirm. Resolves a choice id, or `undefined` if dismissed.
 */
export type ConfirmChoice = {
  id: string;
  label: string;
  kind?: "danger" | "primary";
};

export class Confirm {
  readonly result: Promise<string | undefined>;
  private readonly root: HTMLElement;
  private readonly onKey: (e: KeyboardEvent) => void;
  private settle: ((id: string | undefined) => void) | null = null;

  constructor(
    host: HTMLElement,
    spec: { title: string; body?: string; choices: readonly ConfirmChoice[] },
  ) {
    this.root = document.createElement("div");
    this.root.className =
      "pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-ink/55 backdrop-blur-sm";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    const panel = document.createElement("div");
    panel.className =
      "flex w-80 flex-col gap-3 rounded-3xl border border-white/15 bg-black/55 p-5 text-canopy shadow-2xl shadow-black/50";
    const title = document.createElement("h2");
    title.className = "m-0 font-dock text-base font-semibold tracking-wide";
    title.textContent = spec.title;
    panel.append(title);
    if (spec.body) {
      const body = document.createElement("p");
      body.className = "m-0 font-dock text-[13px] leading-relaxed text-canopy/55";
      body.textContent = spec.body;
      panel.append(body);
    }
    const row = document.createElement("div");
    row.className = "mt-1 flex gap-2";
    for (const choice of spec.choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = buttonClass(choice.kind);
      btn.textContent = choice.label;
      btn.addEventListener("click", () => this.finish(choice.id));
      row.append(btn);
    }
    panel.append(row);
    this.root.append(panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.finish(undefined);
    });
    this.onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.finish(undefined);
    };
    window.addEventListener("keydown", this.onKey, true);
    host.append(this.root);
    this.result = new Promise((resolve) => {
      this.settle = resolve;
    });
  }

  cancel(): void {
    this.finish(undefined);
  }

  private finish(id: string | undefined): void {
    if (!this.settle) return;
    const settle = this.settle;
    this.settle = null;
    window.removeEventListener("keydown", this.onKey, true);
    this.root.remove();
    settle(id);
  }
}

function buttonClass(kind: ConfirmChoice["kind"]): string {
  const base =
    "flex-1 appearance-none rounded-2xl border px-3 py-2 font-dock text-[13px] tracking-wide";
  if (kind === "danger") return `${base} border-red-400/40 bg-transparent text-red-200 hover:bg-red-400/10`;
  if (kind === "primary") return `${base} border-canopy/35 bg-canopy/15 text-canopy hover:bg-canopy/25`;
  return `${base} border-white/15 bg-transparent text-canopy/80 hover:bg-white/10`;
}
