/**
 * Saved matches. Picking one asks the lobby to open a replay session.
 */
import { GameScreen } from "../screen/screen";

export type ReplayOption = {
  id: string;
  mapName: string;
  savedAt: number;
  duration: number;
  result: "victory" | "defeat" | "ended";
};

export class ReplaySelect extends GameScreen {
  constructor(
    replays: readonly ReplayOption[],
    hooks: { onBack: () => void; onPick: (id: string) => void; onDelete: (id: string) => void },
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
    title.textContent = "Replays";
    head.append(back, title);

    const list = document.createElement("div");
    list.className = "menu-list";

    if (replays.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-empty";
      empty.textContent = "No replays yet. Finish a match (victory or defeat).";
      list.append(empty);
    } else {
      for (const replay of replays) {
        const row = document.createElement("div");
        row.className = "menu-replay";
        const item = document.createElement("button");
        item.type = "button";
        item.className = "menu-btn menu-btn-row menu-replay-pick";
        const result = replay.result === "victory" ? "Victory" : replay.result === "defeat" ? "Defeat" : "Ended";
        const label = document.createElement("span");
        label.textContent = `${result}  ·  ${replay.mapName}  ·  ${formatTime(replay.duration)}`;
        const when = document.createElement("span");
        when.className = "menu-replay-when";
        when.textContent = new Date(replay.savedAt).toLocaleString();
        item.append(label, when);
        item.addEventListener("click", () => hooks.onPick(replay.id));
        const del = document.createElement("button");
        del.type = "button";
        del.className = "menu-replay-del";
        del.textContent = "Delete";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          hooks.onDelete(replay.id);
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
