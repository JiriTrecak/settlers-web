import type { GridPos, LandscapeType } from "../../shared";

export type HudMapGroup = "tutorial" | "single" | "multi" | "generated";

export type HudMapOption = {
  id: string;
  name: string;
  group: HudMapGroup;
  detail?: string;
};

export type HudState = {
  cursor: GridPos | null;
  landscape: LandscapeType | null;
  height: number | null;
  zoom: number;
};

const GROUP_LABEL: Record<HudMapGroup, string> = {
  tutorial: "Tutorial",
  single: "Single",
  multi: "Multi",
  generated: "Generated",
};

const GROUP_ORDER: HudMapGroup[] = ["tutorial", "single", "multi", "generated"];

/** Stats, help, map picker. Does not own the minimap. */
export class Hud {
  readonly mapIds: readonly string[];
  private readonly stats: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly picker: HTMLDivElement;
  private readonly select: HTMLSelectElement;
  private readonly onSelectMap: (id: string) => void;

  constructor(host: HTMLElement, maps: readonly HudMapOption[], hooks: { onSelectMap: (id: string) => void }) {
    this.onSelectMap = hooks.onSelectMap;

    this.stats = document.createElement("div");
    this.stats.className = "hud-stats";

    this.help = document.createElement("div");
    this.help.className = "hud-help";
    this.help.append(
      document.createTextNode("drag / WASD pan  ·  wheel zoom  ·  minimap drag  ·  click tile  ·  space fit  ·  1–9 maps  ·  "),
    );
    const assetsLink = document.createElement("a");
    assetsLink.href = "/original_conv/viewer/index.html";
    assetsLink.className = "hud-link";
    assetsLink.textContent = "assets";
    this.help.append(assetsLink);

    this.picker = document.createElement("div");
    this.picker.className = "hud-maps";
    this.select = document.createElement("select");
    this.select.className = "hud-map-select";
    this.select.setAttribute("aria-label", "Map");

    for (const group of GROUP_ORDER) {
      const items = maps.filter((m) => m.group === group);
      if (items.length === 0) continue;
      const optgroup = document.createElement("optgroup");
      optgroup.label = GROUP_LABEL[group];
      for (const map of items) {
        const opt = document.createElement("option");
        opt.value = map.id;
        opt.textContent = map.detail ? `${map.name}  ·  ${map.detail}` : map.name;
        optgroup.append(opt);
      }
      this.select.append(optgroup);
    }

    if (maps.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "no maps";
      opt.disabled = true;
      this.select.append(opt);
    }

    this.select.addEventListener("change", this.onChange);
    this.picker.append(this.select);

    if (!maps.some((m) => m.group !== "generated")) {
      const hint = document.createElement("div");
      hint.className = "hud-maps-hint";
      hint.textContent = "npm run dump:maps";
      this.picker.append(hint);
    }

    host.append(this.stats, this.help, this.picker);
    this.mapIds = maps.map((m) => m.id);
  }

  setMap(id: string): void {
    this.select.value = id;
  }

  setBusy(busy: boolean): void {
    this.select.disabled = busy;
  }

  update(state: HudState): void {
    const tile = state.cursor
      ? `${state.cursor.x}, ${state.cursor.y}   ${state.landscape ?? "—"}   h=${state.height ?? 0}`
      : "—";
    this.stats.textContent = `${tile}\n${state.zoom.toFixed(2)}×`;
  }

  destroy(): void {
    this.select.removeEventListener("change", this.onChange);
    this.stats.remove();
    this.help.remove();
    this.picker.remove();
  }

  private readonly onChange = (): void => {
    this.onSelectMap(this.select.value);
  };
}
