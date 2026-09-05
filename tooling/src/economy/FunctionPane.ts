/**
 * Function tab: pick a machine, edit its fields, paint door / flag / stacks
 * on the iso preview. Does not run sim brains.
 */
import { DIRECTIONS } from "../../../src/shared";
import type { BuildingDraft, DirRel } from "./format";
import {
  CONVERT_MODES,
  DEPOSITS,
  GATHER_TARGETS,
  GOODS,
  MACHINE_LABEL,
  MACHINES,
  PLACE_GROUNDS,
  SPAWNS,
  WORKERS,
  type ConvertMode,
  type Deposit,
  type GatherTarget,
  type GoodId,
  type Job,
  type Machine,
  type SpawnKind,
} from "./job";
import type { IsoPreview, SiteLayer } from "./IsoPreview";
import type { BuildingStore } from "./store";

const SITE_LAYERS: { id: SiteLayer; label: string }[] = [
  { id: "door", label: "Door" },
  { id: "flag", label: "Flag" },
  { id: "workSpot", label: "Spot" },
  { id: "workCenter", label: "Center" },
  { id: "request", label: "Request" },
  { id: "offer", label: "Offer" },
];

export class FunctionPane {
  readonly root: HTMLElement;
  siteLayer: SiteLayer = "door";
  private facing: DirRel["direction"] = "ne";
  private good: GoodId = "trunk";
  private readonly machine: HTMLSelectElement;
  private readonly worker: HTMLSelectElement;
  private readonly view: HTMLInputElement;
  private readonly grounds: HTMLElement;
  private readonly fields: HTMLElement;
  private readonly siteRow: HTMLElement;
  private readonly facingRow: HTMLElement;
  private readonly goodRow: HTMLElement;
  private readonly counts: HTMLElement;
  private readonly extra: HTMLSelectElement;
  private lastFields = "";

  constructor(
    private readonly store: BuildingStore,
    private readonly preview: IsoPreview,
    private readonly onChange: () => void,
  ) {
    this.root = el("div", "ed-pane");
    this.root.append(span("Machine", "ed-label"));
    this.machine = select(MACHINES.map((id): [string, string] => [id, MACHINE_LABEL[id]]));
    this.machine.addEventListener("change", () => {
      this.store.setMachine(this.machine.value as Machine);
      this.onChange();
    });
    this.root.append(this.machine);

    this.root.append(span("Worker", "ed-label"));
    this.worker = select([["", "— none"], ...WORKERS.map((w): [string, string] => [w, w.replace(/_/g, " ")])]);
    this.worker.addEventListener("change", () => {
      this.store.update({ worker: this.worker.value || null });
      this.onChange();
    });
    this.root.append(this.worker);

    const viewWrap = el("label", "ed-field");
    viewWrap.append(span("View distance", "ed-label"));
    this.view = document.createElement("input");
    this.view.className = "ed-input ed-input-num";
    this.view.type = "number";
    this.view.min = "0";
    this.view.step = "1";
    this.view.addEventListener("change", () => {
      this.store.update({ viewDistance: num(this.view.value) });
      this.onChange();
    });
    viewWrap.append(this.view);
    this.root.append(viewWrap);

    this.root.append(span("Ground", "ed-label"));
    this.grounds = el("div", "ed-paint");
    for (const g of PLACE_GROUNDS) {
      const b = btn(g, "ed-btn ed-btn-sm");
      b.dataset.ground = g;
      b.addEventListener("click", () => {
        this.store.toggleGround(g);
        this.onChange();
      });
      this.grounds.append(b);
    }
    this.root.append(this.grounds);

    this.fields = el("div", "ed-fn-fields");
    this.root.append(this.fields);

    this.root.append(span("Iso sites", "ed-label"));
    this.siteRow = el("div", "ed-paint");
    for (const s of SITE_LAYERS) {
      const b = btn(s.label, "ed-btn ed-btn-sm");
      b.dataset.site = s.id;
      b.addEventListener("click", () => {
        this.siteLayer = s.id;
        this.onChange();
      });
      this.siteRow.append(b);
    }
    this.root.append(this.siteRow);

    this.facingRow = el("div", "ed-field");
    this.facingRow.append(span("Spot facing", "ed-label"));
    const face = select(DIRECTIONS.map((d): [string, string] => [d, d.toUpperCase()]));
    face.addEventListener("change", () => {
      this.facing = face.value as DirRel["direction"];
      const cur = this.store.selected();
      if (cur?.workSpot) {
        this.store.update({ workSpot: { ...cur.workSpot, direction: this.facing } });
        this.onChange();
      }
    });
    this.extra = face;
    this.facingRow.append(face);
    this.root.append(this.facingRow);

    this.goodRow = el("div", "ed-field");
    this.goodRow.append(span("Stack good", "ed-label"));
    const goods = select(GOODS.map((g): [string, string] => [g, g]));
    goods.addEventListener("change", () => {
      this.good = goods.value as GoodId;
    });
    this.goodRow.append(goods);
    this.root.append(this.goodRow);

    this.counts = el("div", "ed-counts");
    this.root.append(this.counts);
    const hint = el("p", "ed-hint");
    hint.textContent =
      "White door, red flag cell + waving sprite, purple request, green offer, magenta work spot. LMB paint, RMB erase.";
    this.root.append(hint);
  }

  bindPreview(): void {
    this.preview.setPaint(this.siteLayer, (dx, dy, on) => {
      this.store.paintSite(this.siteLayer, dx, dy, on, { material: this.good, direction: this.facing });
      this.onChange();
    });
    this.preview.setHutAlpha(0.45);
  }

  paint(): void {
    const b = this.store.selected();
    const on = b != null;
    this.machine.disabled = !on;
    this.worker.disabled = !on;
    this.view.disabled = !on;
    if (!b) return;
    this.machine.value = b.job.type;
    this.worker.value = b.worker ?? "";
    this.view.value = String(b.viewDistance);
    this.extra.value = b.workSpot?.direction ?? this.facing;
    this.facing = (b.workSpot?.direction ?? this.facing) as DirRel["direction"];
    for (const chip of this.grounds.querySelectorAll<HTMLButtonElement>("[data-ground]")) {
      chip.classList.toggle("is-on", b.ground.includes(chip.dataset.ground ?? ""));
    }
    for (const chip of this.siteRow.querySelectorAll<HTMLButtonElement>("[data-site]")) {
      chip.classList.toggle("is-on", chip.dataset.site === this.siteLayer);
    }
    this.facingRow.hidden = this.siteLayer !== "workSpot";
    this.goodRow.hidden = this.siteLayer !== "request" && this.siteLayer !== "offer";
    this.paintFields(b);
    this.counts.textContent = `${b.requestStacks.length} request · ${b.offerStacks.length} offer`;
  }

  private paintFields(b: BuildingDraft): void {
    const key = `${b.civ}:${b.id}:${JSON.stringify(b.job)}`;
    if (key === this.lastFields) return;
    this.lastFields = key;
    const job = b.job;
    this.fields.replaceChildren();
    this.fields.append(span(MACHINE_LABEL[job.type], "ed-label"));
    if (job.type === "house") {
      this.fields.append(this.rowSelect("Spawn", SPAWNS, job.spawn, (v) => this.patchJob({ ...job, spawn: v as SpawnKind })));
      this.fields.append(this.rowNum("Beds", job.beds, (n) => this.patchJob({ ...job, beds: n })));
      this.fields.append(this.rowNum("Spawn ms", job.produceMs, (n) => this.patchJob({ ...job, produceMs: n })));
    } else if (job.type === "military") {
      this.fields.append(this.rowNum("Garrison", job.garrison, (n) => this.patchJob({ ...job, garrison: n })));
      this.fields.append(this.rowFlags("Occupies land", job.occupies, (v) => this.patchJob({ ...job, occupies: v })));
    } else if (job.type === "gather") {
      this.fields.append(
        this.rowSelect("Target", GATHER_TARGETS, job.target, (v) => this.patchJob({ ...job, target: v as GatherTarget })),
      );
      this.fields.append(this.rowNum("Radius", job.radius, (n) => this.patchJob({ ...job, radius: n })));
    } else if (job.type === "mine") {
      this.fields.append(
        this.rowSelect("Deposit", DEPOSITS, job.deposit, (v) => this.patchJob({ ...job, deposit: v as Deposit })),
      );
    } else if (job.type === "convert") {
      this.fields.append(
        this.rowSelect("Mode", CONVERT_MODES, job.mode, (v) => this.patchJob({ ...job, mode: v as ConvertMode })),
      );
      this.fields.append(
        this.rowSelect("Output", GOODS, job.output, (v) => this.patchJob({ ...job, output: v as GoodId })),
      );
      this.fields.append(this.rowNum("Duration ms", job.durationMs, (n) => this.patchJob({ ...job, durationMs: n })));
      this.fields.append(span("Inputs", "ed-label"));
      const chips = el("div", "ed-paint");
      for (const g of GOODS) {
        const bchip = btn(g, "ed-btn ed-btn-sm");
        bchip.classList.toggle("is-on", job.inputs.includes(g));
        bchip.addEventListener("click", () => {
          const inputs = job.inputs.includes(g) ? job.inputs.filter((x) => x !== g) : [...job.inputs, g];
          this.patchJob({ ...job, inputs });
        });
        chips.append(bchip);
      }
      this.fields.append(chips);
    } else if (job.type === "recruit") {
      this.fields.append(this.rowText("From", job.from, (v) => this.patchJob({ ...job, from: v })));
      this.fields.append(this.rowText("To", job.to, (v) => this.patchJob({ ...job, to: v })));
      this.fields.append(
        this.rowSelect("Consume", GOODS, job.consume[0] ?? "blade", (v) => this.patchJob({ ...job, consume: [v as GoodId] })),
      );
    } else {
      const hint = el("p", "ed-hint");
      hint.textContent =
        job.type === "store"
          ? "No worker. Request and offer cells are the same piles."
          : job.type === "heal"
            ? "Radius uses view distance. No stacks."
            : job.type === "temple"
              ? "Priest occupy + mana. Spells later."
              : "Dockyard: goods → a ship unit.";
      this.fields.append(hint);
    }
  }

  private patchJob(job: Job): void {
    this.store.update({ job });
    this.onChange();
  }

  private rowSelect(label: string, values: readonly string[], current: string, onPick: (v: string) => void): HTMLElement {
    const wrap = el("label", "ed-field");
    wrap.append(span(label, "ed-label"));
    const s = select(values.map((v): [string, string] => [v, v]));
    s.value = current;
    s.addEventListener("change", () => onPick(s.value));
    wrap.append(s);
    return wrap;
  }

  private rowNum(label: string, current: number, onPick: (n: number) => void): HTMLElement {
    const wrap = el("label", "ed-field");
    wrap.append(span(label, "ed-label"));
    const input = document.createElement("input");
    input.className = "ed-input ed-input-num";
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = String(current);
    input.addEventListener("change", () => onPick(num(input.value)));
    wrap.append(input);
    return wrap;
  }

  private rowText(label: string, current: string, onPick: (v: string) => void): HTMLElement {
    const wrap = el("label", "ed-field");
    wrap.append(span(label, "ed-label"));
    const input = document.createElement("input");
    input.className = "ed-input";
    input.value = current;
    input.addEventListener("change", () => onPick(input.value.trim()));
    wrap.append(input);
    return wrap;
  }

  private rowFlags(label: string, on: boolean, onPick: (v: boolean) => void): HTMLElement {
    const wrap = el("div", "ed-field");
    wrap.append(span(label, "ed-label"));
    const row = el("div", "ed-paint");
    const yes = btn("Yes", "ed-btn ed-btn-sm");
    const no = btn("No", "ed-btn ed-btn-sm");
    yes.classList.toggle("is-on", on);
    no.classList.toggle("is-on", !on);
    yes.addEventListener("click", () => onPick(true));
    no.addEventListener("click", () => onPick(false));
    row.append(yes, no);
    wrap.append(row);
    return wrap;
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

function select(options: Iterable<readonly [string, string]>): HTMLSelectElement {
  const node = document.createElement("select");
  node.className = "ed-input";
  for (const [value, label] of options) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    node.append(opt);
  }
  return node;
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
