import { content } from "../../content/builtin";
import { playerCss } from "../../shared/player/player";
import {
  OBSERVER_RESOURCES,
  type ObserverStats,
  type ObserverPlayerStats,
} from "../../presentation/observerStats";
import { iconArt } from "../settlement/commandArt";
import "./observerPanel.css";

/** Small read-only score sheet. Existing artwork and native text; no extra renderer. */
export class ObserverPanel {
  readonly root = document.createElement("section");
  private readonly body = document.createElement("tbody");
  private readonly interval = document.createElement("span");
  private signature = "";
  constructor(host: HTMLElement) {
    this.root.className = "observer-panel";
    this.root.setAttribute("aria-label", "Observer player statistics");
    const heading = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = "Colony overview";
    const mode = document.createElement("span");
    mode.className = "observer-panel-badge";
    mode.textContent = "Observer";
    heading.append(title, mode);
    const scroll = document.createElement("div");
    scroll.className = "observer-panel-scroll";
    const table = document.createElement("table");
    table.setAttribute(
      "aria-label",
      "Resources, income, units and heroes by player",
    );
    const head = document.createElement("thead"),
      row = document.createElement("tr");
    for (const label of [
      "Player",
      ...OBSERVER_RESOURCES.map((r) => r.label),
      "Units",
      "Workers",
      "Hero",
    ]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      row.append(cell);
    }
    head.append(row);
    table.append(head, this.body);
    scroll.append(table);
    const footer = document.createElement("footer");
    this.interval.className = "observer-income-period";
    footer.append(this.interval);
    this.root.append(heading, scroll, footer);
    host.append(this.root);
  }
  update(stats: ObserverStats) {
    const key = JSON.stringify(stats.players);
    if (key !== this.signature) {
      this.signature = key;
      this.body.replaceChildren(
        ...stats.players.map((player) => this.playerRow(player)),
      );
    }
    const seconds = Math.floor(stats.incomeSeconds);
    this.interval.textContent =
      seconds >= 60
        ? "Income / min · last 60s of game time"
        : `Income / min · ${seconds}s of game time sampled`;
    this.interval.title =
      "Gross resources delivered to completed halls, normalized to one game minute. Starting stock, spending and refunds do not count. The income window restarts when loading a save.";
  }
  private playerRow(player: ObserverPlayerStats): HTMLTableRowElement {
    const row = document.createElement("tr");
    row.dataset.player = String(player.player);
    row.style.setProperty("--observer-color", playerCss(player.player));
    row.classList.toggle("observer-player-defeated", player.defeated);
    const who = document.createElement("th");
    who.scope = "row";
    who.className = "observer-player";
    const badge = document.createElement("span");
    badge.className = "observer-player-badge";
    badge.textContent = String(player.player + 1);
    const identity = document.createElement("span");
    identity.className = "observer-player-identity";
    const name = document.createElement("strong");
    name.textContent = player.name;
    name.title = player.name;
    const role = document.createElement("small");
    role.textContent = `Player ${player.player + 1} · ${player.defeated ? "Defeated" : player.controller}`;
    identity.append(name, role);
    who.append(badge, identity);
    row.append(who);
    for (const resource of player.resources) {
      const spec = OBSERVER_RESOURCES.find((r) => r.item === resource.item)!;
      const cell = document.createElement("td");
      cell.className = "observer-resource";
      cell.setAttribute(
        "aria-label",
        `${spec.label}: ${resource.stored}, income ${resource.perMinute} per minute`,
      );
      cell.title = `${spec.explanation} ${resource.stored} currently stored in completed halls. +${resource.perMinute}/min delivered; spending is excluded from income.`;
      const display = document.createElement("div");
      display.className = "observer-resource-main";
      display.innerHTML = iconArt(content.get(resource.item).icon);
      const amount = document.createElement("strong");
      amount.textContent = number(resource.stored);
      display.append(amount);
      const income = document.createElement("span");
      income.className = "observer-income";
      income.textContent = `+${number(resource.perMinute)}/min`;
      cell.append(display, income);
      row.append(cell);
    }
    for (const [value, label, tip] of [
      [
        player.units,
        "Total units",
        `${player.units} living units, including ${player.workers} workers and ${player.army} army units. Workers inside buildings are included; fallen heroes are excluded.`,
      ],
      [
        player.workers,
        "Total workers",
        "All living workers, including idle, gathering, constructing, and workers inside production buildings.",
      ],
    ] as const) {
      const cell = document.createElement("td");
      cell.className = "observer-population";
      cell.title = tip;
      cell.setAttribute("aria-label", `${label}: ${value}`);
      cell.textContent = number(value);
      row.append(cell);
    }
    const heroes = document.createElement("td");
    heroes.className = "observer-heroes";
    if (!player.heroes.length) {
      heroes.textContent = "—";
      heroes.title = "No hero recruited.";
    }
    for (const hero of player.heroes) {
      const display = document.createElement("div");
      display.className = `observer-hero observer-hero-${hero.status}`;
      display.innerHTML = iconArt(hero.icon);
      const info = document.createElement("span");
      info.textContent = `Lv. ${hero.level}`;
      if (hero.status !== "alive") {
        const status = document.createElement("small");
        status.textContent = hero.status === "reviving" ? "Reviving" : "Fallen";
        info.append(status);
      }
      display.title = `${hero.name} · Level ${hero.level} · ${hero.status}`;
      display.setAttribute("aria-label", display.title);
      display.append(info);
      heroes.append(display);
    }
    row.append(heroes);
    return row;
  }
  destroy() {
    this.root.remove();
  }
}
const number = (value: number) => value.toLocaleString("en-US");
