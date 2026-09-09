import { GameScreen } from "../screen/screen";
import { playableMaps, type MapEntry } from "../../shared/map/library";
import {
  defaultSlots,
  setLocalController,
  type MatchSetup,
} from "../../shared/match/skirmish";
import { playerCss } from "../../shared/player/player";
import type { SlotKind } from "../../shared/match/match";
import { mapPreview, mapTerrain } from "./mapPreview";
import "./skirmish.css";

export class SkirmishScreen extends GameScreen {
  constructor(hooks: {
    onBack(): void;
    onStart(setup: MatchSetup): void;
    initial?: MatchSetup;
    playerName: string;
  }) {
    super("screen skirmish-screen");
    const maps = playableMaps(),
      cache = new Map<string, HTMLCanvasElement>();
    let selected = maps.find((m) => m.id === hooks.initial?.mapId) ?? maps[0];
    let slots = selected
      ? hooks.initial?.mapId === selected.id
        ? hooks.initial.slots.map((s) => ({ ...s }))
        : defaultSlots(selected.map.playerStarts)
      : [];
    const main = el("main", "skirmish-shell");
    const header = el("header", "skirmish-heading");
    const titles = el("div");
    titles.append(
      el("p", "skirmish-eyebrow", "UNDER THE CANOPY"),
      el("h1", "", "Skirmish"),
    );
    const back = el("button", "skirmish-back", "← Main menu");
    back.onclick = hooks.onBack;
    header.append(titles, back);
    const body = el("div", "skirmish-layout");
    const atlas = el("section", "skirmish-atlas");
    atlas.setAttribute("aria-label", "Choose a battlefield");
    atlas.append(el("h2", "skirmish-section-title", "Battlefields"));
    const list = el("div", "skirmish-maps");
    atlas.append(list);
    const details = el("section", "skirmish-details");
    details.setAttribute("aria-label", "Map details");
    const preview = el("div", "skirmish-preview");
    const title = el("h2", "skirmish-map-title");
    const meta = el("p", "skirmish-meta");
    const description = el("p", "skirmish-description");
    const legend = el("div", "skirmish-legend");
    legend.innerHTML =
      '<span><i class="skirmish-dot"></i> Starting positions</span><span><i class="skirmish-camp"></i> Neutral camps</span>';
    details.append(preview, legend, title, meta, description);
    const roster = el("section", "skirmish-roster");
    roster.setAttribute("aria-label", "Player setup");
    roster.append(el("h2", "skirmish-section-title", "Players"));
    const playerRows = el("div", "skirmish-players");
    const hint = el(
      "p",
      "skirmish-hint",
      "Choose your starting position, or set every player to AI to watch the match.",
    );
    const observer = el("div", "skirmish-mode");
    observer.setAttribute("role", "status");
    const rules = el("div", "skirmish-rules");
    rules.append(
      el("span", "", "VICTORY"),
      el("p", "", "Destroy the rival colony’s main hall."),
      el("span", "", "OPPONENT"),
      el(
        "p",
        "",
        "AI builds its economy, leads its hero, and commands its own army.",
      ),
    );
    roster.append(playerRows, hint, observer, rules);
    body.append(atlas, details, roster);
    const footer = el("footer", "skirmish-footer");
    footer.append(el("p", "", "Local match · All map positions are occupied"));
    const launch = el("button", "skirmish-launch");
    launch.disabled = !selected;
    launch.onclick = () => {
      if (selected)
        hooks.onStart({
          mapId: selected.id,
          slots: slots.map((s) => ({ ...s })),
        });
    };
    footer.append(launch);
    const terrain = (m: MapEntry) => {
      let c = cache.get(m.id);
      if (!c) {
        c = mapTerrain(m.map);
        cache.set(m.id, c);
      }
      return c;
    };
    const refresh = () => {
      if (!selected) {
        details.append(
          el("p", "", "Create a playable map in the editor to begin."),
        );
        launch.textContent = "No maps available";
        return;
      }
      const human = slots.find((s) => s.kind === "human")?.player ?? null;
      preview.replaceChildren(
        mapPreview(selected.map, human, terrain(selected)),
      );
      title.textContent = selected.name;
      meta.textContent = `${selected.map.size} × ${selected.map.size} · ${slots.length} players · ${selected.map.camps.length} neutral camps`;
      description.textContent =
        selected.map.description ??
        "A frontier beneath the canopy. Establish your colony, explore the wilds, and overcome your rivals.";
      list.querySelectorAll("button").forEach((b) => {
        const active = b.dataset.mapId === selected.id;
        b.setAttribute("aria-pressed", String(active));
      });
      playerRows.replaceChildren();
      for (const slot of slots) {
        const row = el("label", "skirmish-player");
        row.style.setProperty("--player-color", playerCss(slot.player));
        const marker = el(
          "span",
          "skirmish-player-marker",
          String(slot.player + 1),
        );
        const name = el(
          "span",
          "skirmish-player-name",
          `Player ${slot.player + 1}`,
        );
        const sub = el(
          "small",
          "",
          slot.kind === "human" ? hooks.playerName || "You" : "Computer",
        );
        name.append(sub);
        const select = el("select");
        select.setAttribute(
          "aria-label",
          `Player ${slot.player + 1} controller`,
        );
        for (const [value, text] of [
          ["human", "Human"],
          ["ai", "AI"],
        ]) {
          const option = el("option", "", text);
          option.value = value;
          select.append(option);
        }
        select.value = slot.kind;
        select.onchange = () => {
          slots = setLocalController(
            slots,
            slot.player,
            select.value as SlotKind,
          );
          refresh();
        };
        row.append(marker, name, select);
        playerRows.append(row);
      }
      observer.textContent =
        human === null
          ? "Observer · Watch all colonies"
          : "Playing as Player " + (human + 1);
      observer.dataset.observer = String(human === null);
      launch.textContent =
        human === null ? "Watch match →" : "Start skirmish →";
    };
    for (const map of maps) {
      const button = el("button", "skirmish-map");
      button.dataset.mapId = map.id;
      const thumb = el("canvas");
      thumb.width = thumb.height = 84;
      thumb.getContext("2d")!.drawImage(terrain(map), 0, 0, 84, 84);
      thumb.setAttribute("aria-hidden", "true");
      const name = el("span");
      name.append(
        el("strong", "", map.name),
        el(
          "small",
          "",
          `${map.players} players · ${map.map.size} × ${map.map.size}`,
        ),
      );
      button.append(thumb, name);
      button.onclick = () => {
        const human = slots.find((s) => s.kind === "human")?.player ?? null;
        selected = map;
        slots = defaultSlots(
          map.map.playerStarts,
          human !== null &&
            !map.map.playerStarts.some((s) => s.player === human + 1)
            ? map.map.playerStarts[0].player - 1
            : human,
        );
        refresh();
      };
      list.append(button);
    }
    main.append(header, body, footer);
    this.root.append(main);
    this.onEscape(hooks.onBack);
    refresh();
  }
}
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
