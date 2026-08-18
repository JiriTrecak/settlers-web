/**
 * Placeable-hut strip + debug unit dump. Session owns the selected tool; this only emits it.
 */
import type { BuildingKind } from "../../sim/data/buildings";

export const PLACEABLE: { kind: BuildingKind; label: string }[] = [
  { kind: "lumberjack", label: "Lumberjack" },
  { kind: "forester", label: "Forester" },
  { kind: "stonecutter", label: "Stonecutter" },
  { kind: "sawmill", label: "Sawmill" },
  { kind: "small_livinghouse", label: "House" },
  { kind: "tower", label: "Tower" },
];

/** Debug dump. Not a production barracks. */
const UNITS: { count: number; label: string }[] = [
  { count: 1, label: "Swordsman" },
  { count: 10, label: "Swordsman ×10" },
  { count: 100, label: "Swordsman ×100" },
];

export type PlaceTool =
  | { type: "building"; kind: BuildingKind }
  | { type: "unit"; kind: "swordsman"; count: number };

type Tab = "buildings" | "units";

export class BuildMenu {
  private readonly root: HTMLDivElement;
  private readonly buildings = document.createElement("div");
  private readonly units = document.createElement("div");
  private readonly tabBtns = new Map<Tab, HTMLButtonElement>();
  private readonly buildingBtns = new Map<BuildingKind, HTMLButtonElement>();
  private readonly unitBtns = new Map<number, HTMLButtonElement>();
  private tab: Tab = "buildings";
  private tool: PlaceTool | null = null;

  constructor(host: HTMLElement, hooks: { onTool: (tool: PlaceTool | null) => void }) {
    this.root = document.createElement("div");
    this.root.className = "hud-build";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "Build");

    const tabs = document.createElement("div");
    tabs.className = "hud-build-tabs";
    tabs.setAttribute("role", "tablist");
    for (const id of ["buildings", "units"] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.textContent = id === "buildings" ? "Buildings" : "Units";
      btn.addEventListener("click", () => this.setTab(id));
      this.tabBtns.set(id, btn);
      tabs.append(btn);
    }

    this.buildings.className = "hud-build-list";
    for (const { kind, label } of PLACEABLE) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        const next: PlaceTool | null = this.tool?.type === "building" && this.tool.kind === kind ? null : { type: "building", kind };
        this.setTool(next);
        hooks.onTool(next);
      });
      this.buildingBtns.set(kind, btn);
      this.buildings.append(btn);
    }

    this.units.className = "hud-build-list";
    for (const { count, label } of UNITS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        const next: PlaceTool | null =
          this.tool?.type === "unit" && this.tool.count === count ? null : { type: "unit", kind: "swordsman", count };
        this.setTool(next);
        hooks.onTool(next);
      });
      this.unitBtns.set(count, btn);
      this.units.append(btn);
    }

    this.root.append(tabs, this.buildings, this.units);
    this.sync();
    host.append(this.root);
  }

  setTool(tool: PlaceTool | null): void {
    this.tool = tool;
    if (tool?.type === "unit") this.tab = "units";
    else if (tool?.type === "building") this.tab = "buildings";
    this.sync();
  }

  destroy(): void {
    this.root.remove();
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.sync();
  }

  private sync(): void {
    for (const [id, btn] of this.tabBtns) {
      btn.classList.toggle("is-selected", id === this.tab);
      btn.setAttribute("aria-selected", id === this.tab ? "true" : "false");
    }
    this.buildings.hidden = this.tab !== "buildings";
    this.units.hidden = this.tab !== "units";
    for (const [kind, btn] of this.buildingBtns) {
      btn.classList.toggle("is-selected", this.tool?.type === "building" && this.tool.kind === kind);
    }
    for (const [count, btn] of this.unitBtns) {
      btn.classList.toggle("is-selected", this.tool?.type === "unit" && this.tool.count === count);
    }
  }
}
