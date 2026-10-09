import {raceSelect} from './raceSelect';
import {raceDefinition} from '../../content/races';
import {BUILDING_CELL_SIZE} from '../../shared/spatial/footprint';
import {content} from '../../content/builtin';
import {heroSelect} from './heroSelect';
import { GameScreen } from "../screen/screen";
import { playableMaps, overviewOf } from "../../shared/map/library";
import {
  defaultSlots,
  setLocalController,
  type MatchSetup,
} from "../../shared/match/skirmish";
import { playerCss } from "../../shared/player/player";
import type { SlotKind } from "../../shared/match/match";
import { mapPreview } from "./mapPreview";
import "./skirmish.css";

export class SkirmishScreen extends GameScreen {
  constructor(hooks: {
    onBack(): void;
    onStart(setup: MatchSetup): void;
    initial?: MatchSetup;
    playerName: string;
  }) {
    super("screen skirmish-screen");
    const maps = playableMaps();
    let selected = maps.find((m) => m.id === hooks.initial?.mapId) ?? maps[0];
    let slots = selected
      ? hooks.initial?.mapId === selected.id
        ? hooks.initial.slots.map((s) => ({ ...s }))
        : defaultSlots(overviewOf(selected).starts)
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
      '<span><i class="skirmish-dot"></i> Starting positions</span><span>△ Neutral camps</span><span>● Amber</span>';
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
      el("p", "", "Destroy all rival buildings. The last surviving side wins."),
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
    const refresh = () => {
      if (!selected) {
        details.append(
          el("p", "", "Create a playable map in the editor to begin."),
        );
        launch.textContent = "No maps available";
        return;
      }
      if (overviewOf(selected).sandbox) slots = defaultSlots(overviewOf(selected).starts);
      const human = slots.find((s) => s.kind === "human")?.player ?? null;
      preview.replaceChildren(
        mapPreview(selected, human),
      );
      title.textContent = selected.name;
      meta.textContent = `${overviewOf(selected).size / BUILDING_CELL_SIZE} × ${overviewOf(selected).size / BUILDING_CELL_SIZE} C · ${slots.length} players · ${overviewOf(selected).camps} neutral camps`;
      if (overviewOf(selected).sandbox) meta.textContent = `${overviewOf(selected).size / BUILDING_CELL_SIZE} × ${overviewOf(selected).size / BUILDING_CELL_SIZE} C · Single-player testbed`;
      hint.textContent = overviewOf(selected).sandbox ? "One hero. Full visibility. No opponents." : "Choose your starting position, or set every player to AI to watch the match.";
      rules.replaceChildren(el("span", "", overviewOf(selected).sandbox ? "TESTBED" : "VICTORY"), el("p", "", overviewOf(selected).sandbox ? "Explore freely. No base, automatic spawns, or victory conditions." : "Destroy all rival buildings. The last surviving side wins."));
      if (!overviewOf(selected).sandbox) rules.append(el("span", "", "OPPONENT"), el("p", "", "AI builds its economy, leads its hero, and commands its own army."));
      footer.firstElementChild!.textContent = overviewOf(selected).sandbox ? "Local terrain and texture testbed" : "Local match · All map positions are occupied";
      description.textContent =
        overviewOf(selected).description ??
        "A frontier beneath the canopy. Establish your colony, explore the wilds, and overcome your rivals.";
      list.querySelectorAll("button").forEach((b) => {
        const active = b.dataset.mapId === selected.id;
        b.setAttribute("aria-pressed", String(active));
      });
      playerRows.replaceChildren();
      for (const slot of slots) {
        const row = el("div", "skirmish-player");
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
        select.disabled = !!overviewOf(selected).sandbox;
        select.onchange = () => {
          slots = setLocalController(
            slots,
            slot.player,
            select.value as SlotKind,
          );
          refresh();
        };
        const controls=el('div','skirmish-player-controls');controls.append(select);
        slot.race??=content.rules.defaultRace;
        if(!overviewOf(selected).sandbox)controls.append(raceSelect(content.rules.races,slot.race,id=>{slot.race=id;slot.hero=raceDefinition(content.rules,id).startingSetup.hero?.default;refresh();},`Player ${slot.player+1} race`));
        const heroes=raceDefinition(content.rules,slot.race).startingSetup.hero;
        if(heroes&&!overviewOf(selected).sandbox){
          slot.hero=heroes.choices.includes(slot.hero??'')?slot.hero:heroes.default;
          controls.append(heroSelect(heroes,slot.hero!,id=>{slot.hero=id;},`Player ${slot.player+1} starting hero`));
        }
        row.append(marker, name, controls);
        playerRows.append(row);
      }
      observer.textContent =
        human === null
          ? "Observer · Watch all colonies"
          : "Playing as Player " + (human + 1);
      observer.dataset.observer = String(human === null);
      launch.textContent =
        overviewOf(selected).sandbox ? "Open testbed →" : human === null ? "Watch match →" : "Start skirmish →";
    };
    for (const map of maps) {
      const button = el("button", "skirmish-map");
      button.dataset.mapId = map.id;
      const thumb = mapPreview(map,null,true);
      thumb.setAttribute("aria-hidden", "true");
      const name = el("span");
      name.append(
        el("strong", "", map.name),
        el(
          "small",
          "",
          `${overviewOf(map).sandbox ? "Single-player testbed" : `${map.players} players`} · ${overviewOf(map).size / BUILDING_CELL_SIZE} × ${overviewOf(map).size / BUILDING_CELL_SIZE} C`,
        ),
      );
      button.append(thumb, name);
      button.onclick = () => {
        const human = slots.find((s) => s.kind === "human")?.player ?? null;
        selected = map;
        slots = defaultSlots(
          overviewOf(map).starts,
          human !== null &&
            !overviewOf(map).starts.some((s) => s.player === human + 1)
            ? overviewOf(map).starts[0].player - 1
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
