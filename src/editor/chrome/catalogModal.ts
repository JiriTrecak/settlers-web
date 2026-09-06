/**
 * Full catalogue modal. Browse by category, create assets, pick one for the stamp tool.
 */
import { PreviewCache } from "../../render";
import { ASSET_CATEGORIES, type CatalogEntry } from "../../shared";
import { Confirm, btn, btnPrimary, hairH, hairV, scrim, sheet } from "../../ui";
import type { CatalogueStore } from "../assets/store";
import { AssetForm } from "./assetForm";

export class CatalogModal {
  private readonly root: HTMLElement;
  private readonly path: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly cats: HTMLElement;
  private readonly useBtn: HTMLButtonElement;
  private readonly onKey: (e: KeyboardEvent) => void;
  private form: AssetForm | null = null;
  private dialog: Confirm | null = null;
  private readonly previews = new PreviewCache();
  private readonly cards = new Map<string, HTMLButtonElement>();
  private filter: string | "all" = "all";
  private highlighted: string | null;

  constructor(
    host: HTMLElement,
    private readonly spec: {
      store: CatalogueStore;
      selected: string | null;
      onPick: (id: string) => void;
      onClose: () => void;
      onLibrary: () => void;
    },
  ) {
    this.highlighted = spec.selected;
    this.root = document.createElement("div");
    this.root.className = scrim;
    const panel = document.createElement("div");
    panel.className = `flex h-[min(680px,86vh)] w-[min(920px,92vw)] flex-col overflow-hidden rounded-2xl ${sheet}`;
    panel.append(this.header(), rule(hairH), this.body(), rule(hairH), this.footer());
    this.path = panel.querySelector("[data-path]")!;
    this.grid = panel.querySelector("[data-grid]")!;
    this.cats = panel.querySelector("[data-cats]")!;
    this.useBtn = panel.querySelector("[data-use]")!;
    this.root.append(panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.close();
    });
    this.onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.form) this.closeForm();
      else this.close();
    };
    window.addEventListener("keydown", this.onKey, true);
    host.append(this.root);
    this.refresh();
  }

  close(): void {
    this.dialog?.cancel();
    this.form?.destroy();
    this.previews.destroy();
    window.removeEventListener("keydown", this.onKey, true);
    this.root.remove();
    this.spec.onClose();
  }

  private header(): HTMLElement {
    const el = document.createElement("div");
    el.className = "flex items-center gap-3 px-5 py-3";
    const titles = document.createElement("div");
    titles.className = "min-w-0 flex-1";
    const h = document.createElement("h2");
    h.className = "m-0 font-dock text-[15px] font-semibold tracking-tight";
    h.textContent = "Catalogue";
    const path = document.createElement("p");
    path.dataset.path = "1";
    path.className = "m-0 truncate font-dock text-[11px] text-canopy/40";
    titles.append(h, path);
    const actions = document.createElement("div");
    actions.className = "flex items-center gap-0.5";
    actions.append(
      ghost("Open", () => void this.open()),
      ghost("Project", () => void this.resetProject()),
      ghost("Save", () => void this.save()),
      primary("New", () => this.openForm()),
    );
    el.append(titles, actions, ghost("Close", () => this.close()));
    return el;
  }

  private body(): HTMLElement {
    const el = document.createElement("div");
    el.className = "flex min-h-0 flex-1";
    const cats = document.createElement("nav");
    cats.dataset.cats = "1";
    cats.className = "flex w-44 shrink-0 flex-col gap-0.5 p-3";
    const grid = document.createElement("div");
    grid.dataset.grid = "1";
    grid.className = "grid flex-1 auto-rows-min grid-cols-3 content-start gap-3 overflow-auto p-5";
    el.append(cats, rule(hairV), grid);
    return el;
  }

  private footer(): HTMLElement {
    const el = document.createElement("div");
    el.className = "flex items-center justify-between gap-3 px-5 py-3";
    const hint = document.createElement("p");
    hint.className = "m-0 font-dock text-[12px] text-canopy/35";
    hint.textContent = "Double-click or Use — then click the map to stamp.";
    const use = document.createElement("button");
    use.type = "button";
    use.dataset.use = "1";
    use.className = btnPrimary;
    use.textContent = "Use";
    use.addEventListener("click", () => {
      if (this.highlighted) this.spec.onPick(this.highlighted);
    });
    el.append(hint, use);
    return el;
  }

  private refresh(): void {
    this.path.textContent = this.spec.store.dirty ? `${this.spec.store.path} •` : this.spec.store.path;
    this.cats.replaceChildren();
    for (const id of ["all", ...ASSET_CATEGORIES]) {
      const count =
        id === "all"
          ? this.spec.store.doc.assets.length
          : this.spec.store.doc.assets.filter((a) => a.category === id).length;
      if (id !== "all" && count === 0) continue;
      this.cats.append(this.catBtn(id, count));
    }
    const shown = this.spec.store.doc.assets.filter((a) => this.filter === "all" || a.category === this.filter);
    this.cards.clear();
    this.grid.replaceChildren();
    if (shown.length === 0) {
      const empty = document.createElement("p");
      empty.className = "col-span-3 px-1 font-dock text-[13px] text-canopy/35";
      empty.textContent = "Nothing here yet. New adds a glTF to this catalogue.";
      this.grid.append(empty);
    }
    for (const asset of shown) this.grid.append(this.card(asset));
    this.paintHighlight();
  }

  private paintHighlight(): void {
    this.useBtn.disabled = !this.highlighted;
    for (const [id, el] of this.cards) {
      const on = id === this.highlighted;
      el.classList.toggle("ring-1", on);
      el.classList.toggle("ring-canopy/45", on);
      el.classList.toggle("bg-white/[0.08]", on);
      el.classList.toggle("bg-white/[0.035]", !on);
    }
  }

  private catBtn(id: string, count: number): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    const on = this.filter === id;
    el.className = `flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-dock text-[13px] tracking-tight ${on ? "bg-white/[0.08] text-canopy" : "bg-transparent text-canopy/55 hover:bg-white/[0.04] hover:text-canopy"}`;
    const name = document.createElement("span");
    name.textContent = id === "all" ? "All" : titleCase(id);
    const n = document.createElement("span");
    n.className = "tabular-nums text-[11px] text-canopy/35";
    n.textContent = String(count);
    el.append(name, n);
    el.addEventListener("click", () => {
      this.filter = id;
      this.refresh();
    });
    return el;
  }

  private card(asset: CatalogEntry): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className =
      "flex w-full flex-col items-stretch overflow-hidden rounded-xl bg-white/[0.035] text-left font-dock hover:bg-white/[0.06]";
    const frame = document.createElement("div");
    frame.className = "pointer-events-none aspect-square w-full bg-plate";
    const shot = document.createElement("img");
    shot.alt = "";
    shot.className = "h-full w-full object-contain";
    const url = this.spec.store.urls().get(asset.id);
    if (url) this.previews.paint(url, shot);
    frame.append(shot);
    const cap = document.createElement("div");
    cap.className = "flex flex-col gap-0.5 px-2.5 py-2";
    const name = document.createElement("span");
    name.className = "text-[13px] font-medium tracking-tight";
    name.textContent = asset.name;
    const meta = document.createElement("span");
    meta.className = "text-[11px] tracking-wide text-canopy/40";
    meta.textContent = `${titleCase(asset.category)} · ${titleCase(asset.type)}`;
    cap.append(name, meta);
    el.append(frame, cap);
    el.addEventListener("click", () => {
      this.highlighted = asset.id;
      this.paintHighlight();
    });
    el.addEventListener("dblclick", () => this.spec.onPick(asset.id));
    this.cards.set(asset.id, el);
    return el;
  }

  private openForm(): void {
    this.closeForm();
    this.form = new AssetForm(this.root, {
      onCancel: () => this.closeForm(),
      onCreate: (draft) => {
        const entry = this.spec.store.create(draft);
        this.highlighted = entry.id;
        this.closeForm();
        this.spec.onLibrary();
        this.refresh();
      },
    });
  }

  private closeForm(): void {
    this.form?.destroy();
    this.form = null;
  }

  private async open(): Promise<void> {
    if (!(await this.ifClean())) return;
    const result = await this.spec.store.openFile();
    if (result === "fail") {
      await this.alert("Couldn't open", "That file isn't a valid catalogue.");
      return;
    }
    if (result === "ok") {
      this.highlighted = this.spec.store.doc.assets[0]?.id ?? null;
      this.spec.onLibrary();
      this.refresh();
    }
  }

  private async resetProject(): Promise<void> {
    if (!(await this.ifClean())) return;
    this.spec.store.useProject();
    this.highlighted = this.spec.store.doc.assets[0]?.id ?? null;
    this.spec.onLibrary();
    this.refresh();
  }

  private async save(): Promise<void> {
    const result = await this.spec.store.save();
    if (result === "fail") await this.alert("Couldn't save", "The catalogue could not be written.");
    this.refresh();
  }

  private async ifClean(): Promise<boolean> {
    if (!this.spec.store.dirty) return true;
    const choice = await this.ask("Unsaved catalogue", "Save this catalogue before opening another?", [
      { id: "cancel", label: "Cancel" },
      { id: "discard", label: "Discard", kind: "danger" },
      { id: "save", label: "Save", kind: "primary" },
    ]);
    if (choice === "save") return (await this.spec.store.save()) === "ok";
    return choice === "discard";
  }

  private async ask(
    title: string,
    body: string,
    choices: { id: string; label: string; kind?: "danger" | "primary" }[],
  ): Promise<string | undefined> {
    this.dialog?.cancel();
    const dialog = new Confirm(this.root, { title, body, choices });
    this.dialog = dialog;
    const choice = await dialog.result;
    if (this.dialog === dialog) this.dialog = null;
    return choice;
  }

  private async alert(title: string, body: string): Promise<void> {
    await this.ask(title, body, [{ id: "ok", label: "OK", kind: "primary" }]);
  }
}

function rule(cls: string): HTMLElement {
  const el = document.createElement("div");
  el.className = cls;
  return el;
}

function ghost(label: string, onClick: () => void): HTMLButtonElement {
  return action(btn, label, onClick);
}

function primary(label: string, onClick: () => void): HTMLButtonElement {
  return action(btnPrimary, label, onClick);
}

function action(cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = cls;
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

function titleCase(s: string): string {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}
