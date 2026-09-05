/**
 * Economy editor: per-civ list on the left, mode panels on the right.
 * Building mode paints occupancy and sticks. Function mode authors the
 * machine + door/flag/stacks. Save/Load writes `assets/game_data/buildings.json`.
 */
import type { Application } from "pixi.js";
import { ToolScreen } from "../ui/screen";
import { assetsForCiv, gfxUrl, loadEconomyCatalog, stackGfx, thumbOf, type BuildingAsset } from "./catalog";
import { CIVS, CIV_LABEL } from "./format";
import { IsoPreview, type OccupancyLayer } from "./IsoPreview";
import { FunctionPane } from "./FunctionPane";
import { BUILDINGS_PATH } from "./disk";
import { BuildingStore } from "./store";

type EditMode = "meta" | "building" | "function" | "textures";

const ICON_META = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10M3 8h10M3 12.5h6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/></svg>`;
const ICON_BUILDING = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 2 7v7h5V10h2v4h5V7z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="miter"/></svg>`;
const ICON_FUNCTION = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 2.2v1.8M8 12v1.8M2.2 8h1.8M12 8h1.8M4 4l1.3 1.3M10.7 10.7 12 12M12 4l-1.3 1.3M5.3 10.7 4 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square"/></svg>`;
const ICON_TEXTURES = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 11.2 6 8l2.2 2 2-2.4 3.3 3.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="6.2" cy="6.2" r="1" fill="currentColor"/></svg>`;

const MODES: { id: EditMode; label: string; icon: string }[] = [
  { id: "meta", label: "Meta", icon: ICON_META },
  { id: "building", label: "Building", icon: ICON_BUILDING },
  { id: "function", label: "Function", icon: ICON_FUNCTION },
  { id: "textures", label: "Textures", icon: ICON_TEXTURES },
];

const MODE_TITLE: Record<EditMode, string> = {
  meta: "Meta",
  building: "Building",
  function: "Function",
  textures: "Textures",
};

export class EconomyScreen extends ToolScreen {
  private readonly store = new BuildingStore();
  private readonly preview: IsoPreview;
  private readonly fnPane: FunctionPane;
  private assets = new Map<string, BuildingAsset>();
  private pickerSlot: "built" | "scaffold" | null = null;
  private mode: EditMode = "building";
  private paintLayer: OccupancyLayer = "blocked";
  private dead = false;

  private readonly listEl: HTMLElement;
  private readonly civEl: HTMLElement;
  private readonly modeTitle: HTMLElement;
  private readonly modeRail: HTMLElement;
  private readonly panes: Record<EditMode, HTMLElement>;
  private readonly nameInput: HTMLInputElement;
  private readonly idInput: HTMLInputElement;
  private readonly plankInput: HTMLInputElement;
  private readonly stoneInput: HTMLInputElement;
  private readonly opacityInput: HTMLInputElement;
  private readonly occCount: HTMLElement;
  private readonly plotCount: HTMLElement;
  private readonly stickCount: HTMLElement;
  private readonly ioStatus: HTMLElement;
  private readonly builtThumb: HTMLImageElement;
  private readonly builtLabel: HTMLElement;
  private readonly scaffoldThumb: HTMLImageElement;
  private readonly scaffoldLabel: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly pickerGrid: HTMLElement;
  private readonly pickerFilter: HTMLInputElement;
  private readonly snapEl: HTMLElement;
  private readonly missEl: HTMLElement;
  private readonly propsEl: HTMLElement;

  constructor(pixi: Application, private readonly onBack: () => void) {
    super("screen ed-screen");
    this.preview = new IsoPreview(pixi, (text) => {
      this.snapEl.textContent = text;
    });
    this.fnPane = new FunctionPane(this.store, this.preview, () => {
      this.paintIo();
      this.fnPane.paint();
      this.syncSites();
    });

    const shell = el("div", "ed");
    const left = el("aside", "ed-left");

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
      this.mode = "meta";
      this.paint();
      void this.syncHut();
      this.nameInput.focus();
      this.nameInput.select();
    });
    listHead.append(add);

    this.listEl = el("div", "ed-list");

    const io = el("div", "ed-io");
    const save = btn("Save", "ed-btn ed-btn-sm");
    save.addEventListener("click", () => void this.saveProject());
    const load = btn("Load", "ed-btn ed-btn-sm");
    load.addEventListener("click", () => void this.loadProject());
    const reset = btn("Reset seed", "ed-btn ed-btn-sm");
    reset.addEventListener("click", () => {
      if (!confirm("Replace the library with dump huts + current TS costs/plots/sticks?")) return;
      this.store.resetToSeed();
      this.paint();
      void this.syncHut();
    });
    this.ioStatus = el("div", "ed-io-status");
    io.append(save, load, reset, this.ioStatus);

    this.missEl = el("div", "ed-miss");
    this.missEl.hidden = true;
    this.missEl.textContent = "No graphics dump at /graphics — thumbs and the hut preview stay empty.";

    left.append(head, this.civEl, listHead, this.listEl, io, this.missEl);

    const right = el("div", "ed-right");
    this.propsEl = el("aside", "ed-props");
    this.modeTitle = el("div", "ed-mode-title");
    this.modeTitle.textContent = MODE_TITLE.building;

    const meta = el("div", "ed-pane");
    this.nameInput = field(meta, "Name");
    this.nameInput.addEventListener("input", () => {
      this.store.update({ name: this.nameInput.value });
      this.paintList();
      this.paintIo();
    });
    this.idInput = field(meta, "Id");
    this.idInput.addEventListener("change", () => {
      this.store.update({ id: this.idInput.value.trim() });
      this.paint();
    });
    const del = btn("Delete", "ed-btn ed-btn-danger");
    del.addEventListener("click", () => {
      const cur = this.store.selected();
      if (!cur) return;
      if (!confirm(`Delete ${cur.name}?`)) return;
      this.store.remove();
      this.paint();
      void this.syncHut();
    });
    meta.append(del);

    const building = el("div", "ed-pane");
    this.plankInput = costRow(building, "Lumber", "plank");
    this.stoneInput = costRow(building, "Stone", "stone");
    this.plankInput.addEventListener("input", () => {
      this.store.update({ plank: num(this.plankInput.value) });
      this.paintIo();
    });
    this.stoneInput.addEventListener("input", () => {
      this.store.update({ stone: num(this.stoneInput.value) });
      this.paintIo();
    });

    building.append(span("Flatten", "ed-label"));
    const flattenRow = el("div", "ed-paint");
    flattenRow.append(
      flagBtn("Yes", "true", () => this.setFlatten(true)),
      flagBtn("No", "false", () => this.setFlatten(false)),
    );
    building.append(flattenRow);
    const flattenHint = el("p", "ed-hint");
    flattenHint.textContent = "Diggers level the plot to one height. Off for mines.";
    building.append(flattenHint);

    building.append(span("Iso occupancy", "ed-label"));
    const paintRow = el("div", "ed-paint");
    paintRow.append(
      paintBtn("Occupied", "blocked", () => this.setPaintLayer("blocked")),
      paintBtn("Plot", "protected", () => this.setPaintLayer("protected")),
      paintBtn("Sticks", "buildMarks", () => this.setPaintLayer("buildMarks")),
    );
    building.append(paintRow);
    const counts = el("div", "ed-counts");
    this.occCount = span("0 occupied", "");
    this.plotCount = span("0 plot", "");
    this.stickCount = span("0 sticks", "");
    counts.append(this.occCount, this.plotCount, this.stickCount);
    building.append(counts);
    const hint = el("p", "ed-hint");
    hint.textContent = "Gold = walk-blocked. Cyan = plot. Orange = fence posts. LMB paint, RMB erase, Alt-drag pan.";
    building.append(hint);

    const op = el("label", "ed-field");
    op.append(span("Texture opacity", "ed-label"));
    this.opacityInput = document.createElement("input");
    this.opacityInput.className = "ed-range";
    this.opacityInput.type = "range";
    this.opacityInput.min = "0";
    this.opacityInput.max = "100";
    this.opacityInput.value = "35";
    this.opacityInput.addEventListener("input", () => this.applyOpacity());
    op.append(this.opacityInput);
    building.append(op);

    const fn = this.fnPane.root;

    const textures = el("div", "ed-pane");
    textures.append(
      assetRow("Built", (this.builtThumb = img("ed-asset-img")), (this.builtLabel = span("", "ed-asset-path")), () =>
        this.openPicker("built"),
      ),
    );
    textures.append(
      assetRow("Scaffold", (this.scaffoldThumb = img("ed-asset-img")), (this.scaffoldLabel = span("", "ed-asset-path")), () =>
        this.openPicker("scaffold"),
      ),
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
      r.addEventListener("change", () => this.preview.setVariant(v));
      lab.append(r, document.createTextNode(v === "built" ? "Built" : "Scaffold"));
      previewRow.append(lab);
    }
    textures.append(previewRow);

    this.panes = { meta, building, function: fn, textures };
    meta.hidden = true;
    fn.hidden = true;
    textures.hidden = true;

    this.snapEl = el("div", "ed-snap");
    this.snapEl.textContent = "origin 0, 0";
    this.propsEl.append(this.modeTitle, meta, building, fn, textures, this.snapEl);

    this.modeRail = el("div", "ed-modes");
    for (const m of MODES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ed-mode";
      b.title = m.label;
      b.dataset.mode = m.id;
      b.innerHTML = m.icon;
      b.addEventListener("click", () => this.setMode(m.id));
      this.modeRail.append(b);
    }

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

    right.append(this.picker, this.propsEl, this.modeRail);

    shell.append(left, right);
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
    await this.store.bootFromDisk();
    if (this.dead) return;
    this.paint();
    const cat = await loadEconomyCatalog();
    if (this.dead) return;
    this.assets = cat.assets;
    this.missEl.hidden = cat.sprites != null;
    this.refreshCostIcons();
    this.paintList();
    this.paintAssets();
    await this.preview.start(cat.sprites);
    if (this.dead) return;
    this.applyMode();
    await this.syncHut();
  }

  private setMode(mode: EditMode): void {
    this.mode = mode;
    this.applyMode();
    this.paintMode();
  }

  private setPaintLayer(layer: OccupancyLayer): void {
    this.paintLayer = layer;
    this.applyMode();
    this.paintMode();
  }

  private setFlatten(on: boolean): void {
    this.store.update({ flatten: on });
    this.paintFlatten();
    this.paintIo();
  }

  private applyMode(): void {
    this.modeTitle.textContent = MODE_TITLE[this.mode];
    for (const id of Object.keys(this.panes) as EditMode[]) {
      this.panes[id].hidden = id !== this.mode;
    }
    if (this.mode === "building") {
      this.preview.setPaint(this.paintLayer, (dx, dy, on) => {
        this.store.paintCell(this.paintLayer, dx, dy, on);
        this.paintCounts();
        this.paintIo();
      });
      this.applyOpacity();
    } else if (this.mode === "function") {
      this.fnPane.bindPreview();
    } else {
      this.preview.setPaint(null, null);
      this.preview.setHutAlpha(0.88);
    }
    for (const b of this.modeRail.querySelectorAll<HTMLButtonElement>(".ed-mode")) {
      b.classList.toggle("is-on", b.dataset.mode === this.mode);
    }
    for (const b of this.propsEl.querySelectorAll<HTMLButtonElement>("[data-paint]")) {
      b.classList.toggle("is-on", b.dataset.paint === this.paintLayer);
    }
  }

  private applyOpacity(): void {
    this.preview.setHutAlpha(Number(this.opacityInput.value) / 100);
  }

  private paint(): void {
    this.paintCivs();
    this.paintList();
    this.paintForm();
    this.paintAssets();
    this.paintCounts();
    this.paintMode();
    this.paintIo();
    this.fnPane.paint();
    if (this.pickerSlot) this.paintPicker();
  }

  private paintMode(): void {
    this.applyMode();
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
    this.propsEl.classList.toggle("is-empty", !on);
    this.nameInput.value = b?.name ?? "";
    this.idInput.value = b?.id ?? "";
    this.plankInput.value = b ? String(b.plank) : "0";
    this.stoneInput.value = b ? String(b.stone) : "0";
    this.nameInput.disabled = !on;
    this.idInput.disabled = !on;
    this.plankInput.disabled = !on;
    this.stoneInput.disabled = !on;
    this.opacityInput.disabled = !on;
    this.paintFlatten();
  }

  private paintFlatten(): void {
    const on = this.store.selected()?.flatten !== false;
    for (const b of this.propsEl.querySelectorAll<HTMLButtonElement>("[data-flatten]")) {
      b.classList.toggle("is-on", b.dataset.flatten === (on ? "true" : "false"));
    }
  }

  private paintCounts(): void {
    const b = this.store.selected();
    this.occCount.textContent = `${b?.blocked.length ?? 0} occupied`;
    this.plotCount.textContent = `${b?.protected.length ?? 0} plot`;
    this.stickCount.textContent = `${b?.buildMarks.length ?? 0} sticks`;
  }

  private paintIo(): void {
    this.ioStatus.textContent = this.store.diskHint();
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
    this.preview.setPlot(b?.blocked ?? [], b?.protected ?? [], b?.buildMarks ?? []);
    this.syncSites();
    await this.preview.show(this.store.civ, b?.built ?? "", b?.scaffold ?? "");
  }

  private syncSites(): void {
    const b = this.store.selected();
    this.preview.setSites({
      door: b?.door ?? { dx: 0, dy: 0 },
      flag: b?.flag ?? { dx: 0, dy: 0 },
      workSpot: b?.workSpot ?? null,
      workCenter: b?.workCenter ?? null,
      request: b?.requestStacks ?? [],
      offer: b?.offerStacks ?? [],
      worker: b?.worker ?? null,
    });
  }

  private refreshCostIcons(): void {
    for (const material of ["plank", "stone"] as const) {
      const icon = this.propsEl.querySelector<HTMLImageElement>(`img[data-good="${material}"]`);
      if (!icon) continue;
      icon.src = stackGfx(material);
    }
  }

  private async saveProject(): Promise<void> {
    const err = await this.store.saveToProject();
    if (err) alert(err);
    this.paintIo();
  }

  private async loadProject(): Promise<void> {
    if (this.store.dirty() && !confirm(`Discard unsaved edits and load ${BUILDINGS_PATH}?`)) return;
    const err = await this.store.loadFromProject();
    if (err) {
      alert(err);
      return;
    }
    this.paint();
    await this.syncHut();
  }
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function span(text: string, className: string): HTMLSpanElement {
  const node = document.createElement("span");
  if (className) node.className = className;
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

function paintBtn(label: string, layer: OccupancyLayer, onClick: () => void): HTMLButtonElement {
  const node = btn(label, "ed-btn ed-btn-sm");
  node.dataset.paint = layer;
  node.addEventListener("click", onClick);
  return node;
}

function flagBtn(label: string, value: string, onClick: () => void): HTMLButtonElement {
  const node = btn(label, "ed-btn ed-btn-sm");
  node.dataset.flatten = value;
  node.addEventListener("click", onClick);
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
