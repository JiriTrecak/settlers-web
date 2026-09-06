/**
 * Floating icon toolbar. `items` is the extension point — append an action or a `sep`.
 */
import { createElement, type IconNode } from "lucide";
import { sheet } from "../skin/skin";

export type IconAction = {
  id: string;
  label: string;
  icon: IconNode;
  run: () => void;
  /** Independent of `setActive` — for on/off tools like the grid. */
  latch?: boolean;
};

export type IconItem = IconAction | { kind: "sep" };

export type IconBarPlace = "top" | "left" | "inline";

const PLACE: Record<IconBarPlace, string> = {
  top: "absolute left-1/2 top-4 -translate-x-1/2 flex-row",
  left: "absolute left-4 top-1/2 -translate-y-1/2 flex-col",
  inline: "relative flex-row",
};

export class IconBar {
  readonly root: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly latch = new Set<string>();

  constructor(
    host: HTMLElement,
    spec: { place: IconBarPlace; items: readonly IconItem[]; label: string; surface?: "sheet" | "plain" },
  ) {
    this.root = document.createElement("div");
    const chrome = spec.surface === "plain" ? "pointer-events-auto flex gap-0.5" : `pointer-events-auto flex gap-0.5 rounded-2xl p-1.5 ${sheet}`;
    this.root.className = `${chrome} ${PLACE[spec.place]}`;
    this.root.setAttribute("role", "toolbar");
    this.root.setAttribute("aria-label", spec.label);
    const row = spec.place === "top" || spec.place === "inline";
    for (const item of spec.items) {
      if ("kind" in item) {
        this.root.append(sep(row));
        continue;
      }
      const el = button(item);
      this.buttons.set(item.id, el);
      if (item.latch) this.latch.add(item.id);
      this.root.append(el);
    }
    host.append(this.root);
  }

  setActive(id: string | null): void {
    for (const [key, el] of this.buttons) {
      if (this.latch.has(key)) continue;
      const on = key === id;
      el.classList.toggle("bg-white/[0.08]", on);
      el.classList.toggle("text-canopy", on);
    }
  }

  setLatch(id: string, on: boolean): void {
    const el = this.buttons.get(id);
    if (!el) return;
    el.classList.toggle("bg-white/[0.08]", on);
    el.classList.toggle("text-canopy", on);
  }

  destroy(): void {
    this.root.remove();
  }
}

function button(tool: IconAction): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", tool.label);
  el.className =
    "group flex min-w-11 appearance-none flex-col items-center justify-center gap-1 rounded-lg border-0 bg-transparent px-2 py-1.5 font-dock text-canopy/80 hover:bg-white/[0.06] hover:text-canopy focus-visible:outline focus-visible:outline-white/25";
  el.append(
    createElement(tool.icon, {
      width: 18,
      height: 18,
      "stroke-width": 1.75,
      class: "pointer-events-none",
    }),
  );
  const caption = document.createElement("span");
  caption.className =
    "pointer-events-none text-[10px] font-medium leading-none tracking-wide text-canopy/45 group-hover:text-canopy/80";
  caption.textContent = tool.label;
  el.append(caption);
  el.addEventListener("click", tool.run);
  return el;
}

function sep(row: boolean): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "separator");
  el.className = row ? "mx-1 w-px self-stretch bg-white/[0.08]" : "my-1 h-px self-stretch bg-white/[0.08]";
  return el;
}
