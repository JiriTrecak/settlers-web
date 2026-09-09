import { iconArt } from "./commandArt";
import type { CostView } from "../../presentation/commands";
/** Delegated so changing selection and resource counters need no new event listeners. */
export class CommandTooltips {
  private readonly box = document.createElement("div");
  private active: HTMLElement | null = null;
  constructor(private readonly host: HTMLElement) {
    this.box.className = "rts-tooltip";
    this.box.id = "rts-command-tooltip";
    this.box.role = "tooltip";
    this.box.hidden = true;
    host.append(this.box);
    host.addEventListener("pointerover", this.over);
    host.addEventListener("pointerout", this.out);
    host.addEventListener("focusin", this.over);
    host.addEventListener("focusout", this.out);
    window.addEventListener("keydown", this.key);
    window.addEventListener("resize", this.hide);
  }
  private over = (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>(
      "[data-tip-name]",
    );
    if (!target || target === this.active) return;
    this.hide();
    this.active = target;
    target.setAttribute("aria-describedby", this.box.id);
    const name = document.createElement("strong");
    name.textContent = target.dataset.tipName ?? "";
    const description = document.createElement("p");
    description.textContent = target.dataset.tipDescription ?? "";
    const costs = document.createElement("div");
    costs.className = "rts-tooltip-costs";
    const rows: CostView[] = JSON.parse(target.dataset.tipCosts ?? "[]");
    for (const cost of rows) {
      const row = document.createElement("span");
      row.innerHTML = iconArt(cost.icon);
      row.append(document.createTextNode(String(cost.amount)));
      row.setAttribute("aria-label", `${cost.amount} ${cost.name}`);
      costs.append(row);
    }
    const shortcut = document.createElement("small");
    shortcut.textContent = target.dataset.tipKey
      ? `Shortcut: ${target.dataset.tipKey}`
      : "";
    this.box.replaceChildren(name, costs, description, shortcut);
    this.box.hidden = false;
    // Commands share one stable tooltip shelf above all four columns.
    const grid = target.closest<HTMLElement>(".rts-command-grid");
    const rect = (grid ?? target).getBoundingClientRect();
    this.box.style.width = grid ? `${rect.width}px` : "320px";
    const height = this.box.offsetHeight, width = this.box.offsetWidth;
    this.box.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, grid ? rect.left : rect.right - width))}px`;
    this.box.style.top = `${grid ? Math.max(8, rect.top - height - 28) : rect.top > height + 32 ? rect.top - height - 30 : Math.min(innerHeight - height - 8, rect.bottom + 10)}px`;

  };
  private out = (event: Event) => {
    if (
      this.active?.contains((event as MouseEvent).relatedTarget as Node | null)
    )
      return;
    this.hide();
  };
  private key = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.hide();
  };
  hide = () => {
    this.active?.removeAttribute("aria-describedby");
    this.active = null;
    this.box.hidden = true;
  };
  destroy() {
    this.host.removeEventListener("pointerover", this.over);
    this.host.removeEventListener("pointerout", this.out);
    this.host.removeEventListener("focusin", this.over);
    this.host.removeEventListener("focusout", this.out);
    window.removeEventListener("keydown", this.key);
    window.removeEventListener("resize", this.hide);
    this.box.remove();
  }
}
