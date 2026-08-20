/**
 * Multiplayer browser: one Name, lobby list, Host / Join. App owns fetch + Channel.
 */
import type { RoomView } from "../../shared";
import { GameScreen } from "../screen/screen";

export type MpMap = { id: string; name: string; players: number };

export class MultiplayerScreen extends GameScreen {
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;
  private readonly name: HTMLInputElement;
  private readonly map: HTMLSelectElement;
  private readonly slots: HTMLInputElement;
  private readonly hostBtn: HTMLButtonElement;
  private readonly joinBtn: HTMLButtonElement;
  private readonly maps: readonly MpMap[];
  private readonly mapName: (id: string) => string;
  private rooms: RoomView[] = [];
  private selectedId: string | null = null;

  constructor(hooks: {
    onBack: () => void;
    onRefresh: () => void;
    onHost: (name: string, mapId: string, slotCount: number) => void;
    onJoin: (roomId: string, name: string) => void;
    onLoadSaves: (name: string) => void;
    maps: readonly MpMap[];
    mapName: (id: string) => string;
    name: string;
    error?: string;
  }) {
    super("screen menu");
    this.maps = hooks.maps;
    this.mapName = hooks.mapName;

    const panel = document.createElement("div");
    panel.className = "menu-panel menu-panel-wide";

    const head = document.createElement("div");
    head.className = "menu-head";
    const nav = document.createElement("div");
    nav.className = "menu-head-row";
    const load = document.createElement("button");
    load.type = "button";
    load.className = "menu-back";
    load.textContent = "Load";
    load.addEventListener("click", () => {
      const name = this.name.value.trim();
      if (!name) {
        this.setError("Enter a name");
        this.name.focus();
        return;
      }
      hooks.onLoadSaves(name);
    });
    nav.append(back(hooks.onBack), load);
    head.append(nav, title("Multiplayer"));

    this.name = document.createElement("input");
    this.name.className = "menu-btn menu-input";
    this.name.placeholder = "Your name";
    this.name.value = hooks.name;
    this.name.addEventListener("input", () => this.syncActions());

    const listHead = document.createElement("div");
    listHead.className = "menu-head-row";
    const listLabel = document.createElement("span");
    listLabel.className = "menu-field-label";
    listLabel.textContent = "Lobbies";
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "menu-back";
    refresh.textContent = "Refresh";
    refresh.addEventListener("click", hooks.onRefresh);
    listHead.append(listLabel, refresh);

    this.list = document.createElement("div");
    this.list.className = "menu-list menu-lobby-list";

    this.map = document.createElement("select");
    this.map.className = "menu-btn";
    for (const m of hooks.maps) {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.players > 1 ? `${m.name}  (${m.players})` : m.name;
      this.map.append(o);
    }
    this.slots = document.createElement("input");
    this.slots.className = "menu-btn";
    this.slots.type = "number";
    this.slots.min = "2";
    this.slots.max = "8";
    this.slots.value = "2";
    this.map.addEventListener("change", () => this.clampSlots());
    this.clampSlots();

    this.hostBtn = button("Host", () => {
      this.clampSlots();
      const name = this.name.value.trim();
      if (!name) {
        this.setError("Enter a name");
        this.name.focus();
        return;
      }
      hooks.onHost(name, this.map.value, Number(this.slots.value));
    });
    this.joinBtn = button("Join", () => {
      const name = this.name.value.trim();
      if (!name) {
        this.setError("Enter a name");
        this.name.focus();
        return;
      }
      const room = this.selected();
      if (!room || !joinable(room)) return;
      hooks.onJoin(room.id, name);
    });
    const actions = document.createElement("div");
    actions.className = "menu-actions";
    actions.append(this.hostBtn, this.joinBtn);

    this.status = document.createElement("p");
    this.status.className = "menu-body";
    if (hooks.error) this.status.textContent = hooks.error;

    panel.append(
      head,
      field("Name", this.name),
      listHead,
      this.list,
      field("Map", this.map),
      field("Players", this.slots),
      actions,
      this.status,
    );
    this.root.append(panel);
    this.onEscape(hooks.onBack);
    this.paint();
    this.syncActions();
    queueMicrotask(() => this.name.focus());
  }

  setRooms(rooms: readonly RoomView[]): void {
    this.rooms = rooms.filter((r) => r.state === "waiting" || r.state === "playing");
    if (this.selectedId && !this.rooms.some((r) => r.id === this.selectedId)) this.selectedId = null;
    this.status.textContent = "";
    this.paint();
    this.syncActions();
  }

  setError(message: string): void {
    this.status.textContent = message;
  }

  private selected(): RoomView | undefined {
    return this.rooms.find((r) => r.id === this.selectedId);
  }

  private cap(): number {
    const picked = this.maps.find((m) => m.id === this.map.value);
    return Math.min(8, Math.max(2, picked?.players ?? 8));
  }

  private clampSlots(): void {
    const max = this.cap();
    this.slots.max = String(max);
    this.slots.value = String(Math.min(max, Math.max(2, Number(this.slots.value) || 2)));
  }

  private syncActions(): void {
    const named = this.name.value.trim().length > 0;
    this.hostBtn.disabled = !named;
    const room = this.selected();
    this.joinBtn.disabled = !named || !room || !joinable(room);
  }

  private paint(): void {
    this.list.replaceChildren();
    if (this.rooms.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-empty";
      empty.textContent = "No lobbies.";
      this.list.append(empty);
      return;
    }
    for (const room of this.rooms) {
      const filled = room.slots.filter((s) => s.name).length;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "menu-btn menu-btn-row";
      if (room.id === this.selectedId) row.classList.add("is-selected");
      const can = joinable(room);
      const state = room.state === "playing" ? "in game" : `${filled}/${room.slots.length}`;
      const host = room.host || room.name;
      row.textContent = `${host}  ·  ${this.mapName(room.mapId)}  ·  ${state}`;
      if (can) {
        row.addEventListener("click", () => {
          this.selectedId = this.selectedId === room.id ? null : room.id;
          this.paint();
          this.syncActions();
        });
      } else {
        row.disabled = true;
      }
      this.list.append(row);
    }
  }
}

export class RoomWaitScreen extends GameScreen {
  private readonly roster: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly status: HTMLElement;
  private readonly startBtn: HTMLButtonElement | null;
  private readonly mapName: string;
  private readonly requireFull: boolean;

  constructor(
    room: RoomView,
    hooks: {
      onStart: () => void;
      onBack: () => void;
      host: boolean;
      mapName: string;
      /** Host is loading a save — wait for a full roster, button says Load. */
      load?: boolean;
    },
  ) {
    super("screen menu");
    this.mapName = hooks.mapName;
    this.requireFull = hooks.load === true;
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    const head = document.createElement("div");
    head.className = "menu-head";
    head.append(back(hooks.onBack), title(hooks.host ? "Lobby" : "Waiting"));
    this.meta = document.createElement("p");
    this.meta.className = "menu-body";
    this.status = document.createElement("p");
    this.status.className = "menu-body";
    this.roster = document.createElement("div");
    this.roster.className = "menu-list";
    panel.append(head, this.meta, this.roster, this.status);
    this.startBtn = hooks.host ? button(hooks.load ? "Load" : "Start", hooks.onStart) : null;
    if (this.startBtn) panel.append(this.startBtn);
    this.root.append(panel);
    this.onEscape(hooks.onBack);
    this.setView(room);
  }

  setView(room: RoomView): void {
    const filled = room.slots.filter((s) => s.name).length;
    this.meta.textContent = this.requireFull
      ? `${this.mapName}  ·  ${filled}/${room.slots.length}  ·  load when full`
      : `${this.mapName}  ·  ${filled}/${room.slots.length}`;
    this.roster.replaceChildren();
    for (const slot of room.slots) {
      const row = document.createElement("div");
      row.className = "menu-btn menu-btn-row";
      row.textContent = slot.name ? `P${slot.player + 1}  ${slot.name}` : `P${slot.player + 1}  empty`;
      this.roster.append(row);
    }
    if (this.startBtn) {
      this.startBtn.disabled = room.state !== "waiting" || (this.requireFull && filled < room.slots.length);
    }
  }

  setError(message: string): void {
    this.status.textContent = message;
  }
}

function joinable(room: RoomView): boolean {
  return room.state === "waiting" && room.slots.some((s) => !s.name);
}

function title(text: string): HTMLHeadingElement {
  const el = document.createElement("h1");
  el.className = "menu-title";
  el.textContent = text;
  return el;
}

function back(onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "menu-back";
  el.textContent = "Back";
  el.addEventListener("click", onClick);
  return el;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const el = document.createElement("label");
  el.className = "menu-field";
  const cap = document.createElement("span");
  cap.className = "menu-field-label";
  cap.textContent = label;
  el.append(cap, control);
  return el;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "menu-btn";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}
