/**
 * Economy editor: per-civ building list, construction costs, catalog assets,
 * iso preview. Saves to localStorage; export/import the JSON file.
 */
import type { Application } from "pixi.js";
import { ToolScreen } from "../ui/screen";
import { assetsForCiv, gfxUrl, loadEconomyCatalog, stackGfx, thumbOf, type BuildingAsset } from "./catalog";
import { CIVS, CIV_LABEL, parseBuildingsFile } from "./format";
import { IsoPreview } from "./IsoPreview";
import { BuildingStore } from "./store";

export class EconomyScreen extends ToolScreen {
  private readonly store = new BuildingStore();
  private readonly preview: IsoPreview;
  private assets = new Map<string, BuildingAsset>();
  private pickerSlot: "built" | "scaffold" | null = null;
  private dead = false;

  private readonly listEl: HTMLElement;
  private readonly civEl: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly idInput: HTMLInputElement;
  private readonly plankInput: HTMLInputElement;
  private readonly stoneInput: HTMLInputElement;
  private readonly builtThumb: HTMLImageElement;
  private readonly builtLabel: HTMLElement;
  private readonly scaffoldThumb: HTMLImageElement;
  private readonly scaffoldLabel: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly pickerGrid: HTMLElement;
  private readonly pickerFilter: HTMLInputElement;
  private readonly snapEl: HTMLElement;
  private readonly formEl: HTMLElement;
  private readonly missEl: HTMLElement;

  constructor(pixi: Application, private readonly onBack: () => void) {
    super("screen ed-screen");
    this.preview = new IsoPreview(pixi, (text) => {
      this.snapEl.textContent = text;
    });

    const shell = el("div", "ed");
    const side = el("aside", "ed-side");

    const head = el("header", "ed-head");
    const titles = el("div", "");
    const kicker = el("div", "ed-kicker");
    kicker.textContent = "Forest Empire";
    const h = document.createElement("h1");
    h.className = "ed-title";
    h.textContent = "Economy";
    titles.append(kicker, h);
    const back = btn("Hub", "ed-btn");
    back.addEventListener("click", () => this.leave());
    head.append(titles, back);

    this.civEl = el("div", "ed-civs");
    for (const civ of CIVS) {
      const tab = btn(CIV_LABEL[civ], "ed-tab");
      tab.dataset.civ = civ;
      tab.addEventListener("click", () => {
        this.store.setCiv(civ);
        this.paint();
        void this.syncHut();
      });
      this.civEl.append(tab);
    }

    const listHead = el("div", "ed-list-head");
    listHead.append(span("Buildings", "ed-label"));
    const add = btn("New", "ed-btn ed-btn-sm");
    add.addEventListener("click", () => {
      this.store.add();
      this.paint();
      void this.syncHut();
      this.nameInput.focus();
      this.nameInput.select();
    });
    listHead.append(add);

    this.listEl = el("div", "ed-list");
    this.formEl = el("form", "ed-form");
    this.formEl.addEventListener("submit", (e) => e.preventDefault());

    this.nameInput = field(this.formEl, "Name");
    this.nameInput.addEventListener("input", () => {
      this.store.update({ name: this.nameInput.value });
      this.paintList();
    });
    this.idInput = field(this.formEl, "Id");
    this.idInput.addEventListener("change", () => {
      this.store.update({ id: this.idInput.value.trim() });
      this.paint();
    });

    this.formEl.append(assetRow("Built", (this.builtThumb = img("ed-asset-img")), (this.builtLabel = span("", "ed-asset-path")), () => this.openPicker("built")));
    this.formEl.append(
      assetRow("Scaffold", (this.scaffoldThumb = img("ed-asset-img")), (this.scaffoldLabel = span("", "ed-asset-path")), () => this.openPicker("scaffold")),
    );

    const previewRow = el("div", "ed-preview");
    previewRow.append(span("Preview", "ed-label"));
    for (const v of ["built", "scaffold"] as const) {
      const lab = document.createElement("label");
      lab.className = "ed-radio";
      const r = document.createElement("input");
      r.type = "radio";
      r.name = "ed-variant";
      r.value = v;
      r.checked = v === "built";
      r.addEventListener("change", () => {
        this.preview.setVariant(v);
      });
      lab.append(r, document.createTextNode(v === "built" ? "Built" : "Scaffold"));
      previewRow.append(lab);
    }
    this.formEl.append(previewRow);

    this.plankInput = costRow(this.formEl, "Lumber", "plank");
    this.stoneInput = costRow(this.formEl, "Stone", "stone");
    this.plankInput.addEventListener("input", () => this.store.update({ plank: num(this.plankInput.value) }));
    this.stoneInput.addEventListener("input", () => this.store.update({ stone: num(this.stoneInput.value) }));

    const del = btn("Delete", "ed-btn ed-btn-danger");
    del.addEventListener("click", () => {
      const cur = this.store.selected();
      if (!cur) return;
      if (!confirm(`Delete ${cur.name}?`)) return;
      this.store.remove();
      this.paint();
      void this.syncHut();
    });
    this.formEl.append(del);

    const io = el("div", "ed-io");
    const exp = btn("Export", "ed-btn ed-btn-sm");
    exp.addEventListener("click", () => downloadJson(this.store.exportText()));
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "application/json,.json";
    file.hidden = true;
    file.addEventListener("change", () => {
      const f = file.files?.[0];
      file.value = "";
      if (f) void this.importFile(f);
    });
    const imp = btn("Import", "ed-btn ed-btn-sm");
    imp.addEventListener("click", () => file.click());
    const reset = btn("Reset seed", "ed-btn ed-btn-sm");
    reset.addEventListener("click", () => {
      if (!confirm("Replace the library with dump huts + current TS costs?")) return;
      this.store.resetToSeed();
      this.paint();
      void this.syncHut();
    });
    io.append(exp, imp, reset, file);

    this.missEl = el("div", "ed-miss");
    this.missEl.hidden = true;
    this.missEl.textContent = "No graphics dump at /graphics — thumbs and the hut preview stay empty.";

    this.snapEl = el("div", "ed-snap");
    this.snapEl.textContent = "origin 0, 0";

    side.append(head, this.civEl, listHead, this.listEl, this.formEl, io, this.missEl, this.snapEl);

    this.picker = el("div", "ed-picker");
    this.picker.hidden = true;
    const pickerHead = el("div", "ed-picker-head");
    this.pickerFilter = document.createElement("input");
    this.pickerFilter.className = "ed-input";
    this.pickerFilter.placeholder = "Filter assets";
    this.pickerFilter.addEventListener("input", () => this.paintPicker());
    const close = btn("Close", "ed-btn ed-btn-sm");
    close.addEventListener("click", () => this.closePicker());
    pickerHead.append(this.pickerFilter, close);
    this.pickerGrid = el("div", "ed-picker-grid");
    this.picker.append(pickerHead, this.pickerGrid);

    shell.append(side, this.picker);
    this.root.append(shell);
    this.onEscape(() => this.leave());
    this.paint();
    void this.boot();
  }

  tick(dtMs: number): void {
    this.preview.tick(dtMs);
  }

  destroy(): void {
    this.dead = true;
    this.preview.destroy();
    this.store.flush();
    super.destroy();
  }

  private leave(): void {
    if (this.pickerSlot) {
      this.closePicker();
      return;
    }
    this.onBack();
  }

  private async boot(): Promise<void> {
    const cat = await loadEconomyCatalog();
    if (this.dead) return;
    this.assets = cat.assets;
    this.missEl.hidden = cat.sprites != null;
    this.refreshCostIcons();
    this.paintList();
    this.paintAssets();
    await this.preview.start(cat.sprites);
    if (this.dead) return;
    await this.syncHut();
  }

  private paint(): void {
    this.paintCivs();
    this.paintList();
    this.paintForm();
    this.paintAssets();
    if (this.pickerSlot) this.paintPicker();
  }

  private paintCivs(): void {
    for (const tab of this.civEl.querySelectorAll<HTMLButtonElement>(".ed-tab")) {
      tab.classList.toggle("is-on", tab.dataset.civ === this.store.civ);
    }
  }

  private paintList(): void {
    const selected = this.store.selectedId;
    this.listEl.replaceChildren();
    for (const b of this.store.list()) {
      const row = btn("", "ed-row");
      if (b.id === selected) row.classList.add("is-on");
      const icon = img("ed-row-icon");
      const asset = this.assets.get(b.built) ?? this.assets.get(b.scaffold);
      const thumb = asset ? thumbOf(asset) : undefined;
      if (thumb) icon.src = gfxUrl(thumb);
      else icon.hidden = true;
      const meta = el("div", "ed-row-meta");
      meta.append(span(b.name, "ed-row-name"), span(b.id, "ed-row-id"));
      row.append(icon, meta);
      row.addEventListener("click", () => {
        this.store.select(b.id);
        this.paint();
        void this.syncHut();
      });
      this.listEl.append(row);
    }
  }

  private paintForm(): void {
    const b = this.store.selected();
    const on = b != null;
    this.formEl.classList.toggle("is-empty", !on);
    this.nameInput.value = b?.name ?? "";
    this.idInput.value = b?.id ?? "";
    this.plankInput.value = b ? String(b.plank) : "0";
    this.stoneInput.value = b ? String(b.stone) : "0";
    this.nameInput.disabled = !on;
    this.idInput.disabled = !on;
    this.plankInput.disabled = !on;
    this.stoneInput.disabled = !on;
  }

  private paintAssets(): void {
    const b = this.store.selected();
    setAsset(this.builtThumb, this.builtLabel, b?.built, this.assets);
    setAsset(this.scaffoldThumb, this.scaffoldLabel, b?.scaffold, this.assets);
  }

  private openPicker(slot: "built" | "scaffold"): void {
    if (!this.store.selected()) return;
    this.pickerSlot = slot;
    this.picker.hidden = false;
    this.pickerFilter.value = "";
    this.paintPicker();
    this.pickerFilter.focus();
  }

  private closePicker(): void {
    this.pickerSlot = null;
    this.picker.hidden = true;
  }

  private paintPicker(): void {
    const q = this.pickerFilter.value.trim().toLowerCase();
    const cur = this.store.selected();
    const picked = this.pickerSlot === "scaffold" ? cur?.scaffold : cur?.built;
    this.pickerGrid.replaceChildren();
    for (const asset of assetsForCiv(this.assets, this.store.civ)) {
      if (q && !`${asset.kind} ${asset.group}`.includes(q)) continue;
      const cell = btn("", "ed-pick");
      if (asset.group === picked) cell.classList.add("is-on");
      const thumb = thumbOf(asset);
      const icon = img("ed-pick-img");
      if (thumb) icon.src = gfxUrl(thumb);
      else icon.hidden = true;
      cell.append(icon, span(prettyKind(asset.kind), "ed-pick-name"));
      cell.addEventListener("click", () => this.pickAsset(asset.group));
      this.pickerGrid.append(cell);
    }
  }

  private pickAsset(group: string): void {
    const cur = this.store.selected();
    if (!cur || !this.pickerSlot) return;
    if (this.pickerSlot === "built") {
      const sync = !cur.scaffold || cur.scaffold === cur.built;
      this.store.update({ built: group, ...(sync ? { scaffold: group } : {}) });
    } else {
      this.store.update({ scaffold: group });
    }
    this.closePicker();
    this.paint();
    void this.syncHut();
  }

  private async syncHut(): Promise<void> {
    const b = this.store.selected();
    await this.preview.show(this.store.civ, b?.built ?? "", b?.scaffold ?? "");
  }

  private refreshCostIcons(): void {
    for (const material of ["plank", "stone"] as const) {
      const icon = this.formEl.querySelector<HTMLImageElement>(`img[data-good="${material}"]`);
      if (!icon) continue;
      icon.src = stackGfx(material);
    }
  }

  private async importFile(file: File): Promise<void> {
    try {
      const parsed = parseBuildingsFile(JSON.parse(await file.text()) as unknown);
      if (!parsed) {
        alert("Not a forest-empire.buildings file.");
        return;
      }
      this.store.replace(parsed);
      this.paint();
      await this.syncHut();
    } catch {
      alert("Could not read that JSON.");
    }
  }
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function span(text: string, className: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

function btn(label: string, className: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  return node;
}

function img(className: string): HTMLImageElement {
  const node = document.createElement("img");
  node.className = className;
  node.alt = "";
  node.addEventListener("error", () => {
    node.hidden = true;
  });
  node.addEventListener("load", () => {
    node.hidden = false;
  });
  return node;
}

function field(form: HTMLElement, label: string): HTMLInputElement {
  const wrap = el("label", "ed-field");
  wrap.append(span(label, "ed-label"));
  const input = document.createElement("input");
  input.className = "ed-input";
  input.autocomplete = "off";
  input.spellcheck = false;
  wrap.append(input);
  form.append(wrap);
  return input;
}

function costRow(form: HTMLElement, label: string, material: "plank" | "stone"): HTMLInputElement {
  const wrap = el("label", "ed-cost");
  const icon = img("ed-good-icon");
  icon.dataset.good = material;
  icon.alt = "";
  wrap.append(icon, span(label, "ed-label"));
  const input = document.createElement("input");
  input.className = "ed-input ed-input-num";
  input.type = "number";
  input.min = "0";
  input.step = "1";
  wrap.append(input);
  form.append(wrap);
  return input;
}

function assetRow(label: string, thumb: HTMLImageElement, path: HTMLElement, onPick: () => void): HTMLElement {
  const wrap = el("div", "ed-asset");
  wrap.append(span(label, "ed-label"));
  const body = el("div", "ed-asset-body");
  const pick = btn("Pick", "ed-btn ed-btn-sm");
  pick.addEventListener("click", onPick);
  body.append(thumb, path, pick);
  wrap.append(body);
  return wrap;
}

function setAsset(
  thumb: HTMLImageElement,
  path: HTMLElement,
  group: string | undefined,
  assets: Map<string, BuildingAsset>,
): void {
  const asset = group ? assets.get(group) : undefined;
  const rel = asset ? thumbOf(asset) : undefined;
  path.textContent = group || "—";
  if (rel) {
    thumb.hidden = false;
    thumb.src = gfxUrl(rel);
  } else {
    thumb.removeAttribute("src");
    thumb.hidden = true;
  }
}

function prettyKind(kind: string): string {
  return kind.replace(/_/g, " ");
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function downloadJson(text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "forest-empire-buildings.json";
  a.click();
  URL.revokeObjectURL(url);
}
