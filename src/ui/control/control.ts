/**
 * Bottom match chrome: minimap well, selection facts, 4×3 command grid.
 * Paints `CommandPage` / `SelectionView`. Clicks only emit ids.
 */
import {
  COMMAND_SLOTS,
  type CommandId,
  type CommandPage,
  type CommandSlot,
  type SelectionView,
} from "./types";

const GRAPHICS = `${import.meta.env.BASE_URL}graphics/`;

const STRIP: { id: string; title: string }[] = [
  { id: "terrain", title: "Terrain" },
  { id: "units", title: "Units" },
  { id: "buildings", title: "Buildings" },
  { id: "ping", title: "Ping" },
];

export class GameControlPanel {
  readonly root: HTMLDivElement;
  /** Session mounts `Minimap` here. Do not reach into the canvas. */
  readonly minimapHost: HTMLDivElement;
  private readonly portrait: HTMLDivElement;
  private readonly portraitImg: HTMLImageElement;
  private readonly facts: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly subEl: HTMLDivElement;
  private readonly cells: Cell[];

  constructor(
    host: HTMLElement,
    hooks: { onCommand: (id: CommandId) => void; onMinimapMode?: (id: string) => void },
  ) {
    this.root = document.createElement("div");
    this.root.className = "gcp";
    this.root.setAttribute("role", "region");
    this.root.setAttribute("aria-label", "Match controls");

    const left = document.createElement("div");
    left.className = "gcp-left";
    this.minimapHost = document.createElement("div");
    this.minimapHost.className = "gcp-minimap";
    const strip = document.createElement("div");
    strip.className = "gcp-strip";
    strip.setAttribute("role", "toolbar");
    strip.setAttribute("aria-label", "Minimap");
    for (const { id, title } of STRIP) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gcp-strip-btn";
      btn.title = title;
      btn.textContent = title.slice(0, 1);
      btn.disabled = true;
      btn.addEventListener("click", () => hooks.onMinimapMode?.(id));
      strip.append(btn);
    }
    left.append(this.minimapHost, strip);

    const mid = document.createElement("div");
    mid.className = "gcp-mid";
    this.portrait = document.createElement("div");
    this.portrait.className = "gcp-portrait";
    this.portraitImg = document.createElement("img");
    this.portraitImg.alt = "";
    this.portraitImg.hidden = true;
    this.portraitImg.addEventListener("error", () => {
      this.portraitImg.hidden = true;
    });
    this.portrait.append(this.portraitImg);
    this.facts = document.createElement("div");
    this.facts.className = "gcp-facts";
    this.titleEl = document.createElement("div");
    this.titleEl.className = "gcp-title";
    this.subEl = document.createElement("div");
    this.subEl.className = "gcp-sub";
    this.facts.append(this.titleEl, this.subEl);
    mid.append(this.portrait, this.facts);

    const grid = document.createElement("div");
    grid.className = "gcp-grid";
    grid.setAttribute("role", "toolbar");
    grid.setAttribute("aria-label", "Commands");
    this.cells = [];
    for (let i = 0; i < COMMAND_SLOTS; i++) {
      this.cells.push(new Cell(grid, (id) => hooks.onCommand(id)));
    }

    this.root.append(left, mid, grid);
    host.append(this.root);
    this.setSelection({ type: "none" });
  }

  setPage(page: CommandPage): void {
    for (let i = 0; i < COMMAND_SLOTS; i++) this.cells[i]!.set(page.slots[i] ?? null);
  }

  setSelection(view: SelectionView): void {
    if (view.type === "none") {
      this.portraitImg.hidden = true;
      this.portraitImg.removeAttribute("src");
      this.titleEl.textContent = "";
      this.subEl.textContent = "";
      return;
    }
    if (view.type === "units") {
      this.portraitImg.hidden = true;
      this.portraitImg.removeAttribute("src");
      this.titleEl.textContent = view.title;
      this.subEl.textContent = view.kinds.map((k) => `${k.count} ${k.kind}`).join(" · ");
      return;
    }
    if (view.icon) {
      this.portraitImg.hidden = false;
      this.portraitImg.src = GRAPHICS + view.icon;
    } else {
      this.portraitImg.hidden = true;
      this.portraitImg.removeAttribute("src");
    }
    this.titleEl.textContent = view.title;
    this.subEl.textContent = view.state;
  }

  destroy(): void {
    this.root.remove();
  }
}

/** One hole in the 4×3. Empty stays a hole. */
class Cell {
  private readonly btn: HTMLButtonElement;
  private readonly count: HTMLSpanElement;
  private readonly img: HTMLImageElement;
  private readonly label: HTMLSpanElement;
  private id: CommandId | null = null;

  constructor(host: HTMLElement, onCommand: (id: CommandId) => void) {
    this.btn = document.createElement("button");
    this.btn.type = "button";
    this.btn.className = "gcp-cell is-empty";
    this.btn.disabled = true;
    this.count = document.createElement("span");
    this.count.className = "gcp-count";
    this.count.hidden = true;
    this.img = document.createElement("img");
    this.img.className = "gcp-icon";
    this.img.alt = "";
    this.img.hidden = true;
    this.img.addEventListener("error", () => {
      this.img.hidden = true;
    });
    this.label = document.createElement("span");
    this.label.className = "gcp-label";
    this.btn.append(this.count, this.img, this.label);
    this.btn.addEventListener("click", () => {
      if (this.id) onCommand(this.id);
    });
    host.append(this.btn);
  }

  set(slot: CommandSlot | null): void {
    this.id = slot?.id ?? null;
    this.btn.disabled = !slot || !slot.enabled;
    this.btn.classList.toggle("is-empty", !slot);
    this.btn.classList.toggle("is-armed", !!slot?.armed);
    this.btn.classList.toggle("is-page", slot?.kind === "page");
    this.btn.tabIndex = slot && slot.enabled ? 0 : -1;
    this.btn.title = slot?.label ?? "";
    this.btn.setAttribute("aria-hidden", slot ? "false" : "true");
    this.label.textContent = slot?.label ?? "";
    if (slot?.icon) {
      this.img.hidden = false;
      this.img.src = GRAPHICS + slot.icon;
    } else {
      this.img.hidden = true;
      this.img.removeAttribute("src");
    }
    if (slot && slot.count != null) {
      this.count.hidden = false;
      this.count.textContent = String(slot.count);
    } else {
      this.count.hidden = true;
      this.count.textContent = "";
    }
  }
}
