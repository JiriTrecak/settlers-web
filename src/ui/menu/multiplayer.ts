/**
 * Host / join a MatchHost room. App owns the Channel after connect.
 */
import { GameScreen } from "../screen/screen";

export type MultiplayerHooks = {
  onBack: () => void;
  onHost: (name: string, mapId: string, slotCount: number) => void;
  onJoin: (roomId: string, name: string) => void;
  maps: { id: string; name: string }[];
};

export class MultiplayerScreen extends GameScreen {
  constructor(hooks: MultiplayerHooks) {
    super("screen menu");
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = "Multiplayer";
    const name = input("Name", "player");
    const map = document.createElement("select");
    map.className = "menu-btn";
    for (const m of hooks.maps) {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.name;
      map.append(o);
    }
    const slots = input("Slots", "2");
    slots.type = "number";
    const host = document.createElement("button");
    host.type = "button";
    host.className = "menu-btn";
    host.textContent = "Host";
    host.addEventListener("click", () => {
      hooks.onHost(name.value.trim() || "player", map.value, Math.min(8, Math.max(2, Number(slots.value) || 2)));
    });
    const room = input("Room id", "");
    const join = document.createElement("button");
    join.type = "button";
    join.className = "menu-btn";
    join.textContent = "Join";
    join.addEventListener("click", () => {
      hooks.onJoin(room.value.trim(), name.value.trim() || "player");
    });
    const back = document.createElement("button");
    back.type = "button";
    back.className = "menu-btn";
    back.textContent = "Back";
    back.addEventListener("click", () => hooks.onBack());
    const note = document.createElement("p");
    note.textContent = "npm run server  — then Host in one tab, Join with the room id in others.";
    panel.append(title, name, map, slots, host, room, join, back, note);
    this.root.append(panel);
  }
}

export class RoomWaitScreen extends GameScreen {
  constructor(roomId: string, hooks: { onStart: () => void; onBack: () => void; host: boolean }) {
    super("screen menu");
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = hooks.host ? "Hosting" : "Waiting";
    const id = document.createElement("p");
    id.textContent = roomId;
    panel.append(title, id);
    if (hooks.host) {
      const start = document.createElement("button");
      start.type = "button";
      start.className = "menu-btn";
      start.textContent = "Start";
      start.addEventListener("click", () => hooks.onStart());
      panel.append(start);
    }
    const back = document.createElement("button");
    back.type = "button";
    back.className = "menu-btn";
    back.textContent = "Back";
    back.addEventListener("click", () => hooks.onBack());
    panel.append(back);
    this.root.append(panel);
  }
}

function input(label: string, value: string): HTMLInputElement {
  const el = document.createElement("input");
  el.className = "menu-btn";
  el.placeholder = label;
  el.value = value;
  return el;
}
