/**
 * Map list. Picking one asks the lobby to start a session with the chosen slot count and tint.
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
  private slots: number;
  private readonly maxSlots: number;

  constructor(
    maps: readonly MapOption[],
    hooks: {
      onBack: () => void;
      onPick: (id: string, player: number, players: number) => void;
      onReplays: () => void;
      onSaves: () => void;
      player?: number;
      players?: number;
    },
  ) {
    super("screen menu");
    this.maxSlots = Math.min(
      PLAYER_COLORS.length,
      Math.max(1, ...maps.map((m) => m.players), 1),
    );
    this.slots = Math.min(Math.max(1, hooks.players ?? Math.min(2, this.maxSlots)), this.maxSlots);
    this.player = clampPlayer(hooks.player ?? 0);
    if (this.slots >= 2) this.player = Math.min(this.player, this.slots - 1);

    const panel = document.createElement("div");
    panel.className = "menu-panel menu-panel-wide";

    const head = document.createElement("div");
    head.className = "menu-head";
    const nav = document.createElement("div");
    nav.className = "menu-head-row";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "menu-back";
    back.textContent = "Back";
    back.addEventListener("click", hooks.onBack);
    const replays = document.createElement("button");
    replays.type = "button";
    replays.className = "menu-back";
    replays.textContent = "Replays";
    replays.addEventListener("click", hooks.onReplays);
    const saves = document.createElement("button");
    saves.type = "button";
    saves.className = "menu-back";
    saves.textContent = "Load";
    saves.addEventListener("click", hooks.onSaves);
    nav.append(back, replays, saves);
    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = "Single player";
    head.append(nav, title);

    const setup = document.createElement("div");
    setup.className = "menu-setup";

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
        if (this.slots >= 2 && i >= this.slots) return;
        this.player = i;
        this.syncSwatches(swatches);
      });
      swatches.push(swatch);
      colors.append(swatch);
    }

    const slotsWrap = document.createElement("label");
    slotsWrap.className = "menu-slots";
    slotsWrap.textContent = "Players";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Number of players");
    for (let n = 1; n <= this.maxSlots; n++) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = String(n);
      select.append(opt);
    }
    select.value = String(this.slots);
    select.addEventListener("change", () => {
      this.slots = Math.min(this.maxSlots, Math.max(1, Number(select.value) | 0));
      if (this.slots >= 2 && this.player >= this.slots) this.player = this.slots - 1;
      this.syncSwatches(swatches);
    });
    slotsWrap.append(select);

    setup.append(colors, slotsWrap);
    this.syncSwatches(swatches);

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
        item.addEventListener("click", () => {
          const n = Math.min(this.slots, Math.max(1, map.players));
          const me = n >= 2 ? Math.min(this.player, n - 1) : this.player;
          hooks.onPick(map.id, me, n);
        });
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

    panel.append(head, setup, list);
    this.root.append(panel);
    this.onEscape(hooks.onBack);
  }

  private syncSwatches(swatches: readonly HTMLButtonElement[]): void {
    for (let i = 0; i < swatches.length; i++) {
      const el = swatches[i]!;
      const open = this.slots < 2 || i < this.slots;
      el.disabled = !open;
      el.classList.toggle("is-selected", i === this.player);
      el.classList.toggle("is-off", !open);
    }
  }
}
