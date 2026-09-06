/**
 * Floating icon toolbar. `items` is the extension point — append an action or a `sep`.
 */
import { createElement, type IconNode } from "lucide";

export type IconAction = {
  id: string;
  label: string;
  icon: IconNode;
  run: () => void;
};

export type IconItem = IconAction | { kind: "sep" };

export type IconBarPlace = "top" | "left" | "inline";

const SHELL =
  "pointer-events-auto flex min-h-14 min-w-14 gap-1 rounded-3xl border border-white/15 bg-black/40 p-2 text-canopy shadow-2xl shadow-black/50 backdrop-blur-xl";

const PLACE: Record<IconBarPlace, string> = {
  top: "absolute left-1/2 top-4 -translate-x-1/2 flex-row",
  left: "absolute left-4 top-1/2 -translate-y-1/2 flex-col",
  inline: "relative flex-row",
};

export class IconBar {
  readonly root: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(
    host: HTMLElement,
    spec: { place: IconBarPlace; items: readonly IconItem[]; label: string },
  ) {
    this.root = document.createElement("div");
    this.root.className = `${SHELL} ${PLACE[spec.place]}`;
    this.root.setAttribute("role", "toolbar");
    this.root.setAttribute("aria-label", spec.label);
    const row = spec.place === "top";
    for (const item of spec.items) {
      if ("kind" in item) {
        this.root.append(sep(row));
        continue;
      }
      const el = button(item);
      this.buttons.set(item.id, el);
      this.root.append(el);
    }
    host.append(this.root);
  }

  setActive(id: string | null): void {
    for (const [key, el] of this.buttons) {
      const on = key === id;
      el.classList.toggle("bg-white/15", on);
      el.classList.toggle("text-canopy", on);
    }
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
    "group flex min-w-16 appearance-none flex-col items-center justify-center gap-1 rounded-2xl border-0 bg-transparent px-2.5 py-2 font-dock text-canopy/90 hover:bg-white/10 hover:text-canopy focus-visible:outline focus-visible:outline-white/30";
  el.append(
    createElement(tool.icon, {
      width: 22,
      height: 22,
      "stroke-width": 1.75,
      class: "pointer-events-none",
    }),
  );
  const caption = document.createElement("span");
  caption.className =
    "pointer-events-none text-[11px] font-medium leading-none tracking-[0.08em] text-canopy/55 group-hover:text-canopy/90";
  caption.textContent = tool.label;
  el.append(caption);
  el.addEventListener("click", tool.run);
  return el;
}

function sep(row: boolean): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "separator");
  el.className = row ? "mx-1.5 w-px self-stretch bg-white/15" : "my-1.5 h-px self-stretch bg-white/15";
  return el;
}
