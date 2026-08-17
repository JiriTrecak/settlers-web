/**
 * Map list. Picking one asks the lobby to start a session with the chosen player tint.
 */
import { PLAYER_COLORS, clampPlayer, playerCss } from "../../shared";
import { GameScreen } from "../screen/screen";
import type { MapOption, MapOptionGroup } from "./menu";

export type { MapOption, MapOptionGroup };

const GROUP_LABEL: Record<MapOptionGroup, string> = {
  tutorial: "Tutorial",
  single: "Single player",
  multi: "Multiplayer",
  generated: "Generated",
};

const GROUP_ORDER: MapOptionGroup[] = ["tutorial", "single", "multi", "generated"];

export class MapSelect extends GameScreen {
  private player: number;

  constructor(
    maps: readonly MapOption[],
    hooks: { onBack: () => void; onPick: (id: string, player: number) => void; player?: number },
  ) {
    super("screen menu");
    this.player = clampPlayer(hooks.player ?? 0);
    const panel = document.createElement("div");
    panel.className = "menu-panel menu-panel-wide";

    const head = document.createElement("div");
    head.className = "menu-head";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "menu-back";
    back.textContent = "Back";
    back.addEventListener("click", hooks.onBack);
    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = "Single player";
    head.append(back, title);

    const colors = document.createElement("div");
    colors.className = "menu-colors";
    const swatches: HTMLButtonElement[] = [];
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "menu-color";
      swatch.style.background = playerCss(i);
      swatch.setAttribute("aria-label", `Player color ${i + 1}`);
      swatch.addEventListener("click", () => {
        this.player = i;
        for (const s of swatches) s.classList.toggle("is-selected", s === swatch);
      });
      if (i === this.player) swatch.classList.add("is-selected");
      swatches.push(swatch);
      colors.append(swatch);
    }

    const list = document.createElement("div");
    list.className = "menu-list";

    for (const group of GROUP_ORDER) {
      const items = maps.filter((m) => m.group === group);
      if (items.length === 0) continue;
      const label = document.createElement("div");
      label.className = "menu-group";
      label.textContent = GROUP_LABEL[group];
      list.append(label);
      for (const map of items) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "menu-btn menu-btn-row";
        item.textContent = map.detail ? `${map.name}  ·  ${map.detail}` : map.name;
        item.addEventListener("click", () => hooks.onPick(map.id, this.player));
        list.append(item);
      }
    }

    if (maps.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-empty";
      empty.textContent = "No maps. npm run dump:maps";
      list.append(empty);
    } else if (!maps.some((m) => m.group !== "generated")) {
      const hint = document.createElement("div");
      hint.className = "menu-empty";
      hint.textContent = "No dumped maps — npm run dump:maps";
      list.append(hint);
    }

    panel.append(head, colors, list);
    this.root.append(panel);
    this.onEscape(hooks.onBack);
  }
}
