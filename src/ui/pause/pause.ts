/**
 * F10 modal. Session owns the board and verbs; this paints screens and emits clicks.
 */
import { confirmCopy, type PauseView } from "./types";

export type PauseFileRow = {
  id: string;
  name: string;
  mapName: string;
  savedAt: number;
  duration: number;
  remote: boolean;
};

export type PauseMenuHooks = {
  onToggle(): void;
  onBack(): void;
  onSave(): void;
  onLoad(): void;
  onEnd(): void;
  onRestart(): void;
  onPick(id: string): void;
  onName(name: string): void;
  onSubmitSave(): void;
  onConfirm(): void;
  onCancel(): void;
};

export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly hooks: PauseMenuHooks;
  private nameInput: HTMLInputElement | null = null;
  private remote = false;
  private files: PauseFileRow[] = [];
  private view: PauseView = {
    screen: "closed",
    mode: "save",
    name: "Save",
    confirm: null,
    saveId: null,
  };

  constructor(host: HTMLElement, hooks: PauseMenuHooks) {
    this.hooks = hooks;
    this.root = document.createElement("div");
    this.root.className = "hud-pause";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "hud-pause-title");
    this.panel = document.createElement("div");
    this.panel.className = "hud-pause-panel";
    this.root.append(this.panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) hooks.onBack();
    });
    host.append(this.root);
    window.addEventListener("keydown", this.onKey, true);
  }

  setView(view: PauseView, opts: { files: PauseFileRow[]; canLoad: boolean; canRestart: boolean; remote: boolean }): void {
    this.view = view;
    this.files = opts.files;
    this.canLoad = opts.canLoad;
    this.canRestart = opts.canRestart;
    this.remote = opts.remote;
    this.paint();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.root.remove();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key === "F10") {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.hooks.onToggle();
      return;
    }
    if (this.view.screen === "closed") return;
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.hooks.onBack();
  };

  private paint(): void {
    const view = this.view;
    this.root.hidden = view.screen === "closed";
    this.panel.replaceChildren();
    if (view.screen === "closed") return;
    if (view.screen === "menu") this.paintMenu();
    else if (view.screen === "files") this.paintFiles();
    else this.paintConfirm();
  }

  private paintMenu(): void {
    this.panel.append(title("Game"), this.menuBtn("Save", () => this.hooks.onSave()));
    if (this.canLoad) this.panel.append(this.menuBtn("Load", () => this.hooks.onLoad()));
    if (this.canRestart) this.panel.append(this.menuBtn("Restart", () => this.hooks.onRestart()));
    this.panel.append(this.menuBtn("End", () => this.hooks.onEnd(), true));
  }

  private paintFiles(): void {
    const load = this.view.mode === "load";
    const mode = this.remote ? "Multiplayer" : "Singleplayer";
    this.panel.append(title(load ? `Load · ${mode}` : `Save · ${mode}`));
    const list = document.createElement("div");
    list.className = "hud-pause-list";
    if (this.files.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hud-pause-empty";
      empty.textContent = load
        ? `No ${this.remote ? "multiplayer" : "singleplayer"} saves yet.`
        : `No ${this.remote ? "multiplayer" : "singleplayer"} saves yet. Name this one below.`;
      list.append(empty);
    } else {
      for (const file of this.files) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "hud-pause-row";
        if (file.id === this.view.saveId) row.classList.add("is-selected");
        const label = document.createElement("span");
        label.textContent = `${file.name}  ·  ${file.mapName}  ·  ${file.remote ? "MP" : "SP"}`;
        const when = document.createElement("span");
        when.className = "hud-pause-when";
        when.textContent = `${formatTime(file.duration)}  ·  ${new Date(file.savedAt).toLocaleString()}`;
        row.append(label, when);
        row.addEventListener("click", () => this.hooks.onPick(file.id));
        list.append(row);
      }
    }
    this.panel.append(list);
    if (!load) {
      const name = document.createElement("input");
      name.type = "text";
      name.className = "hud-pause-name";
      name.maxLength = 48;
      name.value = this.view.name;
      name.placeholder = "Save name";
      name.addEventListener("input", () => this.hooks.onName(name.value));
      name.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.hooks.onSubmitSave();
        }
      });
      this.nameInput = name;
      this.panel.append(name);
    } else {
      this.nameInput = null;
    }
    const actions = document.createElement("div");
    actions.className = "hud-confirm-actions";
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "Back";
    back.addEventListener("click", () => this.hooks.onBack());
    actions.append(back);
    if (!load) {
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Save";
      save.addEventListener("click", () => this.hooks.onSubmitSave());
      actions.append(save);
    }
    this.panel.append(actions);
    this.nameInput?.focus();
    this.nameInput?.select();
  }

  private paintConfirm(): void {
    const kind = this.view.confirm;
    if (!kind) return;
    const copy = confirmCopy(kind);
    this.panel.append(title(copy.title));
    const body = document.createElement("p");
    body.className = "hud-confirm-body";
    body.textContent = copy.body;
    const actions = document.createElement("div");
    actions.className = "hud-confirm-actions";
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = "Cancel";
    no.addEventListener("click", () => this.hooks.onCancel());
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "is-danger";
    yes.textContent = copy.yes;
    yes.addEventListener("click", () => this.hooks.onConfirm());
    actions.append(no, yes);
    this.panel.append(body, actions);
    no.focus();
  }

  private menuBtn(label: string, onClick: () => void, danger = false): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = danger ? "hud-pause-btn is-danger" : "hud-pause-btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }
}

function title(text: string): HTMLHeadingElement {
  const h = document.createElement("h2");
  h.id = "hud-pause-title";
  h.className = "hud-confirm-title";
  h.textContent = text;
  return h;
}

function formatTime(tick: number, tickMs = 25): string {
  const total = Math.max(0, tick) * (tickMs / 1000);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
