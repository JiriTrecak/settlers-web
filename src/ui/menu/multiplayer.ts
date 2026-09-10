/** Multiplayer discovery and waiting rooms share the skirmish atlas; App owns networking. */
import type { RoomView } from "../../shared";
import { authoredMaps } from "../../shared/map/library";
import { playerCss } from "../../shared/player/player";
import { GameScreen } from "../screen/screen";
import { mapPreview } from "./mapPreview";
import "./skirmish.css";
import "./multiplayer.css";

export type MpMap = { id: string; name: string; players: number };

export class MultiplayerScreen extends GameScreen {
  private readonly list = el("div", "skirmish-maps mp-list");
  private readonly status = el("p", "mp-status");
  private readonly name = document.createElement("input");
  private readonly slots = document.createElement("select");
  private readonly details = new Battlefield();
  private readonly roster = el("div", "skirmish-players");
  private readonly action: HTMLButtonElement;
  private readonly sideTitle = el("h2", "skirmish-section-title");
  private readonly listTitle = el("h2", "skirmish-section-title");
  private readonly hostFields = el("div", "mp-host-fields");
  private readonly hint = el("p", "skirmish-player-hint");
  private readonly footerText = el("p");
  private readonly tabs: HTMLButtonElement[];
  private rooms: RoomView[] = [];
  private selectedId: string | null = null;
  private mapId: string;
  private hosting = false;
  private loaded = false;

  constructor(private readonly hooks: {
    onBack: () => void;
    onRefresh: () => void;
    onClearSessions: () => Promise<number>;
    onHost: (name: string, mapId: string, slotCount: number) => void;
    onJoin: (roomId: string, name: string) => void;
    maps: readonly MpMap[];
    mapName: (id: string) => string;
    name: string;
    error?: string;
  }) {
    super("screen skirmish-screen mp-screen");
    this.mapId = hooks.maps[0]?.id ?? "";
    const shell = frame("Multiplayer", "← Main menu", hooks.onBack);
    const modes = el("div", "mp-modes");
    modes.setAttribute("aria-label", "Multiplayer mode");
    this.tabs = [false, true].map((hosting) => button(hosting ? "Create a lobby" : "Find a lobby", "mp-mode", () => {
      this.hosting = hosting;
      this.paint();
    }));
    modes.append(...this.tabs);
    const layout = el("div", "skirmish-layout");
    const atlas = el("section", "skirmish-atlas");
    const listHead = el("div", "mp-list-head");
    listHead.append(this.listTitle, button("Refresh", "mp-refresh", () => {
      this.status.textContent = "Refreshing lobbies…";
      hooks.onRefresh();
    }));
    atlas.append(listHead, this.list);
    const side = el("section", "skirmish-roster");
    this.name.className = "mp-input";
    this.name.value = hooks.name;
    this.name.placeholder = "Your name";
    this.name.setAttribute("autocomplete", "nickname");
    this.name.addEventListener("input", () => this.syncAction());
    this.slots.className = "mp-input";
    this.hostFields.append(field("Player slots", this.slots));
    side.append(field("Your player name", this.name), this.sideTitle, this.hostFields, this.roster, this.hint);
    layout.append(atlas, this.details.root, side);
    const footer = el("footer", "skirmish-footer");
    this.action = button("Join lobby", "skirmish-launch", () => {
      if (this.action.disabled) return;
      const name = this.name.value.trim();
      if (this.hosting) hooks.onHost(name, this.mapId, Number(this.slots.value));
      else if (this.selectedId) hooks.onJoin(this.selectedId, name);
    });
    footer.append(this.footerText, this.action);
    this.status.setAttribute("role", "status");
    const maintenance = el("div", "mp-maintenance");
    const clear = button("Delete all server sessions", "mp-clear-sessions", () => {
      if (clear.disabled || !window.confirm("Delete ALL server game sessions? This ends active matches and removes every lobby for everyone. This cannot be undone.")) return;
      clear.disabled = true;
      clear.textContent = "Deleting sessions…";
      void hooks.onClearSessions().then((deleted) => {
        this.setRooms([]);
        this.status.textContent = `Deleted ${deleted} server ${deleted === 1 ? "session" : "sessions"}.`;
      }).catch((error: unknown) => {
        this.setError(error instanceof Error ? error.message : "Could not delete server sessions.");
      }).finally(() => {
        clear.disabled = false;
        clear.textContent = "Delete all server sessions";
      });
    });
    maintenance.append(clear, el("span", "", "Clears all lobbies and active matches on the server."));
    shell.append(modes, layout, this.status, footer, maintenance);
    this.root.append(shell);
    this.onEscape(hooks.onBack);
    this.paint();
    if (hooks.error) this.setError(hooks.error);
  }

  setRooms(rooms: readonly RoomView[]): void {
    this.loaded = true;
    this.rooms = rooms.filter((r) => r.state === "waiting" || r.state === "playing");
    if (!this.rooms.some((r) => r.id === this.selectedId)) {
      this.selectedId = this.rooms.find(joinable)?.id ?? this.rooms[0]?.id ?? null;
    }
    this.status.textContent = "";
    this.paint();
  }

  setError(message: string): void {
    this.loaded = true;
    this.status.textContent = message;
    this.paint();
  }

  private syncAction(): void {
    const room = this.rooms.find((r) => r.id === this.selectedId);
    this.action.disabled = !this.name.value.trim() || (this.hosting
      ? !this.hooks.maps.some((m) => m.id === this.mapId && m.players >= 2)
      : !room || !joinable(room) || !this.hooks.maps.some((m) => m.id === room.mapId));
  }

  private paint(): void {
    this.tabs.forEach((tab, i) => tab.setAttribute("aria-pressed", String(this.hosting === (i === 1))));
    this.listTitle.textContent = this.hosting ? "Battlefields" : "Lobbies";
    this.list.parentElement!.querySelector<HTMLButtonElement>(".mp-refresh")!.hidden = this.hosting;
    this.list.replaceChildren();
    this.hostFields.hidden = !this.hosting;
    this.roster.hidden = this.hosting;
    this.sideTitle.textContent = this.hosting ? "Match setup" : "Players";
    this.action.textContent = this.hosting ? "Create lobby" : "Join lobby";
    if (this.hosting) {
      for (const map of this.hooks.maps) {
        const row = button("", "skirmish-map", () => { this.mapId = map.id; this.paint(); });
        row.setAttribute("aria-pressed", String(map.id === this.mapId));
        row.append(el("strong", "", map.name), el("small", "", `Up to ${map.players} players`));
        this.list.append(row);
      }
      if (!this.hooks.maps.length) this.list.append(el("p", "mp-empty", "No multiplayer battlefields available."));
      const map = this.hooks.maps.find((m) => m.id === this.mapId);
      const previous = Number(this.slots.value) || 2;
      this.slots.replaceChildren();
      for (let i = 2; i <= Math.min(8, map?.players ?? 0); i++) {
        const option = el("option", "", `${i} players`);
        option.value = String(i);
        this.slots.append(option);
      }
      this.slots.value = String(Math.min(previous, Math.min(8, map?.players ?? 2)));
      this.details.show(this.mapId, map?.name ?? "Choose a battlefield");
      this.hint.textContent = "Create your lobby, then let the other players join. You choose when the match starts.";
      this.footerText.textContent = "Online match · Shared project maps";
    } else {
      for (const room of this.rooms) {
        const row = button("", "skirmish-map", () => { this.selectedId = room.id; this.paint(); });
        row.setAttribute("aria-pressed", String(room.id === this.selectedId));
        row.append(el("strong", "", room.name || `${room.host}'s lobby`), el("small", "", this.safeMapName(room.mapId)), el("span", `mp-room-state ${joinable(room) ? "is-open" : ""}`, `${room.state === "playing" ? "In game" : joinable(room) ? "Open" : "Full"} · ${occupied(room)}/${room.slots.length}`));
        this.list.append(row);
      }
      if (!this.rooms.length) this.list.append(el("p", "mp-empty", this.loaded ? "No lobbies yet. Create one and invite your friends to join." : "Looking for lobbies…"));
      const room = this.rooms.find((r) => r.id === this.selectedId);
      this.details.show(room?.mapId ?? "", room ? this.safeMapName(room.mapId) : "Your next frontier", !room);
      this.roster.replaceChildren();
      if (room) paintRoster(this.roster, room);
      this.hint.textContent = room ? room.state === "playing" ? "This match is already underway." : !this.hooks.maps.some((m) => m.id === room.mapId) ? "This battlefield is not available in your game." : !joinable(room) ? "This lobby is full. Choose another lobby or create your own." : `Hosted by ${room.host}. Join an open player slot to enter the lobby.` : "Select a lobby to see its battlefield and players.";
      this.footerText.textContent = `${this.rooms.filter(joinable).length} open ${this.rooms.filter(joinable).length === 1 ? "lobby" : "lobbies"} · Refresh to find new matches`;
    }
    this.syncAction();
  }

  private safeMapName(id: string): string {
    try { return this.hooks.mapName(id); } catch { return id; }
  }
}

export class RoomWaitScreen extends GameScreen {
  private readonly roster = el("div", "skirmish-players");
  private readonly meta = el("p", "skirmish-meta");
  private readonly status = el("p", "mp-status");
  private readonly startBtn: HTMLButtonElement | null;
  private readonly footerText = el("p");
  private readonly details = new Battlefield();

  constructor(room: RoomView, private readonly hooks: {
    onStart: () => void;
    onBack: () => void;
    host: boolean;
    mapName: string;
    /** Save loading requires every original player slot to be occupied. */
    load?: boolean;
  }) {
    super("screen skirmish-screen mp-screen");
    const shell = frame(hooks.load ? "Load game lobby" : "Match lobby", "← Leave lobby", hooks.onBack);
    const layout = el("div", "skirmish-layout mp-wait-layout");
    const info = el("section", "skirmish-atlas");
    info.append(el("h2", "skirmish-section-title", "The gathering"), el("h3", "mp-lobby-name", room.name || `${room.host}'s lobby`), el("p", "skirmish-player-hint", `Hosted by ${room.host}`), this.meta, el("div", "skirmish-mode-badge", hooks.host ? "You are the host" : "You have joined"), el("p", "skirmish-description", hooks.load ? "The saved match can resume once every player slot is filled." : hooks.host ? "Gather your players, then start the match when everyone has arrived." : "Settle in. Your match begins when the host starts the game."));
    const side = el("section", "skirmish-roster");
    side.append(el("h2", "skirmish-section-title", "Players"), this.roster, el("p", "skirmish-player-hint", "Player colors match the starting positions on the map."));
    layout.append(info, this.details.root, side);
    const footer = el("footer", "skirmish-footer");
    this.startBtn = hooks.host ? button(hooks.load ? "Load match" : "Start match", "skirmish-launch", () => { if (!this.startBtn?.disabled) hooks.onStart(); }) : null;
    footer.append(this.footerText, this.startBtn ?? el("span", "mp-waiting", "Waiting for the host…"));
    this.status.setAttribute("role", "status");
    shell.append(layout, this.status, footer);
    this.root.append(shell);
    this.onEscape(hooks.onBack);
    this.setView(room);
  }

  setView(room: RoomView): void {
    this.meta.textContent = `${occupied(room)} / ${room.slots.length} players joined`;
    this.details.show(room.mapId, this.hooks.mapName);
    paintRoster(this.roster, room);
    this.footerText.textContent = this.hooks.load && occupied(room) < room.slots.length ? "Waiting for all saved player slots to fill" : room.state === "waiting" ? "Lobby open · Players can join until the match starts" : "Match starting…";
    if (this.startBtn) this.startBtn.disabled = room.state !== "waiting" || (this.hooks.load === true && occupied(room) < room.slots.length);
  }

  setError(message: string): void { this.status.textContent = message; }
}

/** Retain the expensive map canvas across roster and discovery updates. */
class Battlefield {
  readonly root = el("section", "skirmish-details");
  private key: string | undefined;
  show(id: string, name: string, empty = false): void {
    const key = `${id}:${name}:${empty}`;
    if (key === this.key) return;
    this.key = key;
    const map = authoredMaps().find((m) => m.id === id)?.map;
    const preview = el("div", "skirmish-preview mp-preview");
    preview.append(map ? mapPreview(map, null) : el("div", "mp-preview-empty", empty ? "Choose your battlefield" : "Preview unavailable"));
    this.root.replaceChildren(preview, el("p", "skirmish-preview-legend", map ? "◆ Player starting positions" : "UNDER THE CANOPY"), el("h2", "skirmish-map-title", name));
    if (map) this.root.append(el("p", "skirmish-meta", `${map.size} × ${map.size} · ${map.playerStarts?.length ?? 0} starting positions`));
    this.root.append(el("p", "skirmish-description", map?.description || (empty ? "Find a gathering of fellow settlers, or create a new lobby and lead the expedition." : "Build your settlement and claim your place beneath the canopy.")));
  }
}

function occupied(room: RoomView): number { return room.slots.filter((s) => s.name).length; }
function joinable(room: RoomView): boolean { return room.state === "waiting" && room.slots.some((s) => !s.name); }
function paintRoster(root: HTMLElement, room: RoomView): void {
  root.replaceChildren(...room.slots.map((slot) => {
    const row = el("div", `skirmish-player ${slot.name ? "" : "mp-open-slot"}`);
    row.style.setProperty("--player-color", playerCss(slot.player));
    const name = el("div", "skirmish-player-name", slot.name || "Open slot");
    name.append(el("small", "", slot.name ? "Connected" : "Waiting for a player"));
    row.append(el("span", "skirmish-player-marker", String(slot.player + 1)), name);
    return row;
  }));
}
function frame(title: string, back: string, onBack: () => void): HTMLElement {
  const shell = el("main", "skirmish-shell");
  const header = el("header", "skirmish-heading");
  const heading = el("div");
  heading.append(el("p", "skirmish-eyebrow", "UNDER THE CANOPY"), el("h1", "", title));
  header.append(heading, button(back, "skirmish-back", onBack));
  shell.append(header);
  return shell;
}
function field(label: string, control: HTMLElement): HTMLLabelElement {
  const field = el("label", "mp-field");
  field.append(el("span", "", label), control);
  return field;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}
