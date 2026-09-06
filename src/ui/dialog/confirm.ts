/**
 * Glass confirm. Resolves a choice id, or `undefined` if dismissed.
 */
import { btn, btnDanger, btnPrimary, scrim, sheet } from "../skin/skin";

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
    this.root.className = scrim;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    const panel = document.createElement("div");
    panel.className = `flex w-80 flex-col gap-3 rounded-2xl p-5 ${sheet}`;
    const title = document.createElement("h2");
    title.className = "m-0 font-dock text-[15px] font-semibold tracking-tight";
    title.textContent = spec.title;
    panel.append(title);
    if (spec.body) {
      const body = document.createElement("p");
      body.className = "m-0 font-dock text-[13px] leading-relaxed text-canopy/50";
      body.textContent = spec.body;
      panel.append(body);
    }
    const row = document.createElement("div");
    row.className = "mt-1 flex justify-end gap-1";
    for (const choice of spec.choices) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = buttonClass(choice.kind);
      el.textContent = choice.label;
      el.addEventListener("click", () => this.finish(choice.id));
      row.append(el);
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
  if (kind === "danger") return btnDanger;
  if (kind === "primary") return btnPrimary;
  return btn;
}
