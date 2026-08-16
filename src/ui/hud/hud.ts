import type { GridPos, LandscapeType } from "../../shared";

export type HudMapGroup = "tutorial" | "single" | "multi" | "generated";

export type HudMapOption = {
  id: string;
  name: string;
  group: HudMapGroup;
  detail?: string;
};

export type HudHandle = {
  update(state: HudState): void;
  setMap(id: string): void;
  setBusy(busy: boolean): void;
  readonly mapIds: readonly string[];
  readonly minimap: HTMLCanvasElement;
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

export function mountHud(
  host: HTMLElement,
  maps: readonly HudMapOption[],
  onSelectMap: (id: string) => void,
): HudHandle {
  host.replaceChildren();

  const stats = document.createElement("div");
  stats.className = "hud-stats";

  const help = document.createElement("div");
  help.className = "hud-help";
  help.append(
    document.createTextNode("drag / WASD pan  ·  wheel zoom  ·  minimap drag  ·  click tile  ·  space fit  ·  1–9 maps  ·  "),
  );
  const assetsLink = document.createElement("a");
  assetsLink.href = "/original_conv/viewer/index.html";
  assetsLink.className = "hud-link";
  assetsLink.textContent = "assets";
  help.append(assetsLink);

  const minimap = document.createElement("canvas");
  minimap.className = "hud-minimap";
  minimap.width = 168;
  minimap.height = 168;

  const picker = document.createElement("div");
  picker.className = "hud-maps";
  const select = document.createElement("select");
  select.className = "hud-map-select";
  select.setAttribute("aria-label", "Map");

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
    select.append(optgroup);
  }

  if (maps.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "no maps";
    opt.disabled = true;
    select.append(opt);
  }

  select.addEventListener("change", () => onSelectMap(select.value));
  picker.append(select);

  if (!maps.some((m) => m.group !== "generated")) {
    const hint = document.createElement("div");
    hint.className = "hud-maps-hint";
    hint.textContent = "npm run dump:maps";
    picker.append(hint);
  }

  host.append(stats, help, minimap, picker);

  const mapIds = maps.map((m) => m.id);

  return {
    minimap,
    mapIds,
    setMap(id) {
      select.value = id;
    },
    setBusy(busy) {
      select.disabled = busy;
    },
    update(state) {
      const tile = state.cursor
        ? `${state.cursor.x}, ${state.cursor.y}   ${state.landscape ?? "—"}   h=${state.height ?? 0}`
        : "—";
      stats.textContent = `${tile}\n${state.zoom.toFixed(2)}×`;
    },
  };
}
