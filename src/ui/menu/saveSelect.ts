/**
 * Saved matches for one mode (SP or MP). Picking one asks the lobby to load it.
 */
import { GameScreen } from "../screen/screen";

export type SaveOption = {
  id: string;
  name: string;
  mapName: string;
  savedAt: number;
  duration: number;
  remote: boolean;
};

export class SaveSelect extends GameScreen {
  constructor(
    saves: readonly SaveOption[],
    hooks: {
      remote: boolean;
      onBack: () => void;
      onPick: (id: string) => void;
      onDelete: (id: string) => void;
    },
  ) {
    super("screen menu");
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
    title.textContent = hooks.remote ? "Load · Multiplayer" : "Load · Singleplayer";
    head.append(back, title);

    const list = document.createElement("div");
    list.className = "menu-list";

    if (saves.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-empty";
      empty.textContent = hooks.remote
        ? "No multiplayer saves yet. Save from F10 in a match."
        : "No singleplayer saves yet. Save from F10 in a match.";
      list.append(empty);
    } else {
      for (const file of saves) {
        const row = document.createElement("div");
        row.className = "menu-replay";
        const item = document.createElement("button");
        item.type = "button";
        item.className = "menu-btn menu-btn-row menu-replay-pick";
        const label = document.createElement("span");
        label.textContent = `${file.name}  ·  ${file.mapName}  ·  ${file.remote ? "MP" : "SP"}  ·  ${formatTime(file.duration)}`;
        const when = document.createElement("span");
        when.className = "menu-replay-when";
        when.textContent = new Date(file.savedAt).toLocaleString();
        item.append(label, when);
        item.addEventListener("click", () => hooks.onPick(file.id));
        const del = document.createElement("button");
        del.type = "button";
        del.className = "menu-replay-del";
        del.textContent = "Delete";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          hooks.onDelete(file.id);
        });
        row.append(item, del);
        list.append(row);
      }
    }

    panel.append(head, list);
    this.root.append(panel);
    this.onEscape(hooks.onBack);
  }
}

function formatTime(tick: number, tickMs = 25): string {
  const total = Math.max(0, tick) * (tickMs / 1000);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
