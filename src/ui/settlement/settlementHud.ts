import { content } from "../../content/builtin";
import { slotOwner, type Owner } from "../../content/schema";
import {
  commandCard,
  commandPage,
  shortcutCommand,
  queueCard,
  commandMenu,
  commandPageCount,
  type CommandEntry,
  costs,
  type CommandBinding,
} from "../../presentation/commands";
import type { Action } from "../../shared/types/types";
import type { SettlementView } from "../../sim/game/observation";
import { iconArt } from "./commandArt";
import { CommandTooltips } from "./tooltips";
import "./commandDock.css";

/** HTML adapter: receives a presentation model, emits concrete intentions/targeting choices. */
export class SettlementHud {
  readonly root = document.createElement("div");
  readonly minimapHost = document.createElement("div");
  readonly clockHost = document.createElement("div");
  private readonly stock = document.createElement("div");
  private readonly heading = document.createElement("h2");
  private readonly portrait = document.createElement("div");
  private readonly info = document.createElement("p");
  private readonly hint = document.createElement("p");
  private readonly cards = document.createElement("div");
  private readonly grid = document.createElement("div");
  private readonly queues = document.createElement("div");
  private readonly pages = document.createElement("div");
  private readonly mapLabel = document.createElement("span");
  private readonly tooltips: CommandTooltips;
  private readonly owner: Owner;
  private current: SettlementView | null = null;
  private bindings: CommandBinding[] = [];
  private menuEntries: CommandEntry[] = [];
  private category: string | null = null;
  private commandSignature = "";
  private cardsSignature = "";
  private queueSignature = "";
  private page = 0;
  private stockSignature = "";
  private portraitDefinition = "";
  selectedIds: number[] = [];
  targeting: CommandBinding | null = null;
  get selected() {
    return this.selectedIds[0] ?? null;
  }
  set selected(id: number | null) {
    this.setSelection(id === null ? [] : [id]);
  }
  get mode() {
    return this.targeting?.type === "build"
      ? this.targeting.targetDefinition!
      : null;
  }
  get attackMode() {
    return this.targeting?.type === "attack";
  }
  get rallyMode() {
    return this.targeting?.type === "rally";
  }
  get buildingActor() {
    return this.targeting?.actors[0];
  }
  setSelection(ids: readonly number[]) {
    this.selectedIds = [...new Set(ids)];
    this.category = null;
    this.page = 0;
    this.clearMode();
    if (this.current) this.update(this.current, true);
  }
  clearMode() {
    this.targeting = null;
    this.hooks.mode();
    this.hint.textContent = "";
  }
  placement(message: string | null) {
    if (this.mode)
      this.hint.textContent = message ?? "Click to order construction.";
  }
  private readonly onKey = (e: KeyboardEvent) => {
    if (
      e.repeat ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      (e.target instanceof HTMLElement &&
        (e.target.matches("input,textarea,select") ||
          e.target.isContentEditable ||
          e.target.closest("dialog[open]")))
    )
      return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.targeting) this.clearMode();
      else if (this.category) this.navigate(content.actions.categories[this.category]?.parent ?? null);
      this.tooltips.hide();
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      this.hooks.home();
      return;
    }
    const binding = shortcutCommand(this.menuEntries, this.page, e.key) ??
      this.bindings.find(b => ["move", "attack", "stop"].includes(b.type) && b.hotkey === e.key.toUpperCase());
    if (binding?.enabled) {
      e.preventDefault();
      this.activate(binding);
    }
  };
  constructor(
    host: HTMLElement,
    owner: number,
    private readonly hooks: {
      action: (action: Action) => void;
      mode: () => void;
      home: () => void;
    },
  ) {
    this.owner = slotOwner(owner);
    this.root.className = "rts-hud";
    this.stock.className = "rts-resources";
    const dock = document.createElement("div");
    dock.className = "rts-dock";
    const map = document.createElement("section");
    map.className = "rts-map";
    const label = document.createElement("div");
    label.className = "rts-map-label";
    label.append(this.mapLabel);
    this.minimapHost.className = "rts-map-slot";
    map.append(label, this.minimapHost);
    const selection = document.createElement("section");
    selection.className = "rts-selection";
    this.portrait.className = "rts-portrait";
    this.portrait.tabIndex = 0;
    const copy = document.createElement("div");
    copy.className = "rts-selection-copy";
    this.info.className = "rts-info";
    this.info.style.whiteSpace = "pre-line";
    this.hint.className = "rts-notice";
    this.hint.role = "status";
    this.cards.className = "rts-unit-cards";
    this.queues.className = "rts-recruit-queue";
    copy.append(this.heading, this.info, this.cards, this.queues, this.hint);
    this.clockHost.className = "rts-clock-slot";
    selection.append(this.portrait, copy, this.clockHost);
    const actions = document.createElement("section");
    actions.className = "rts-actions";
    this.grid.className = "rts-command-grid declarative-commands";
    this.pages.className = "rts-command-pages";
    actions.append(this.grid, this.pages);
    dock.append(map, selection, actions);
    this.root.append(this.stock, dock);
    host.append(this.root);
    this.tooltips = new CommandTooltips(host);
    window.addEventListener("keydown", this.onKey);
    Object.assign(this.minimapHost.dataset, {
      tipName: "Tactical map",
      tipDescription:
        "Click or drag to move the camera. Bright ground is visible; dim ground is remembered.",
    });
  }
  setMapName(name: string) {
    this.mapLabel.textContent = name;
  }
  private navigate(category: string | null) {
    this.category = category;
    this.page = 0;
    this.clearMode();
    this.tooltips.hide();
    if (this.current) this.update(this.current, true);
  }
  private activate(binding: CommandEntry) {
    if (!binding.enabled) return;
    if ("destination" in binding) {
      this.navigate(binding.destination);
      return;
    }
    if (binding.immediate) {
      this.hooks.action(binding.immediate);
      return;
    }
    this.clearMode();
    this.targeting = binding;
    this.hint.textContent = `${binding.name}: choose a ${binding.type === "build" ? "building location" : binding.type === "attack" ? "target or ground location" : "ground location"}. Escape cancels.`;
  }
  update(view: SettlementView, force = false) {
    if (this.current === view && !force) return;
    this.current = view;
    const valid = new Set(
      view.entities
        .filter(
          (e) =>
            content.get(e.definition).selectable !== false &&
            !e.unit?.contained,
        )
        .map((e) => e.id),
    );
    const filtered = this.selectedIds.filter((id) => valid.has(id));
    if (filtered.length !== this.selectedIds.length) {
      this.selectedIds = filtered;
      this.category = null;
      this.page = 0;
      this.clearMode();
    }
    this.root.classList.toggle(
      "has-unit-selection",
      this.selectedIds.some(
        (id) => view.entities.find((e) => e.id === id)?.unit,
      ),
    );
    const selected = this.selectedIds.map((id) =>
        view.entities.find((e) => e.id === id)!,
      ),
      focus = selected[0];
    this.bindings = commandCard(view, this.selectedIds, this.owner, content);
    if (
      this.targeting &&
      !this.bindings.some(
        (b) =>
          b.id === this.targeting!.id &&
          b.enabled &&
          JSON.stringify(b.actors) === JSON.stringify(this.targeting!.actors),
      )
    )
      this.clearMode();
    const menu = commandMenu(this.bindings, this.category, content);
    this.category = menu.category;
    this.menuEntries = menu.entries;
    this.page = Math.max(
      0,
      Math.min(
        this.page,
        commandPageCount(this.menuEntries) - 1,
      ),
    );
    const signature = JSON.stringify([this.menuEntries, this.page, this.category]);
    if (signature !== this.commandSignature) {
      this.commandSignature = signature;
      this.grid.replaceChildren();
      for (const { binding: b, column, row } of commandPage(
        this.menuEntries,
        this.page,
      )) {
        const button = document.createElement("button");
        button.className = "rts-command";
        button.disabled = !b.enabled;
        button.style.gridColumn = String(column);
        button.style.gridRow = String(row);
        button.innerHTML = iconArt(b.icon);
        if (b.type === "category") button.setAttribute("aria-haspopup", "true");
        if (b.type === "back") {
          const arrow = document.createElement("span");
          arrow.className = "rts-back-arrow";
          arrow.textContent = "↶";
          button.append(arrow);
        }
        const text = document.createElement("span");
        text.className = "rts-command-name";
        text.textContent = b.name;
        button.append(text);
        if (b.hotkey) {
          const key = document.createElement("kbd");
          key.textContent = b.hotkey;
          button.append(key);
        }
        button.setAttribute("aria-label", b.name);
        Object.assign(button.dataset, {
          tipName: b.name,
          tipDescription: [
            b.description,
            b.reason,
            b.actors.length > 1
              ? `${b.actors.length} eligible selected actors`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          tipCosts: JSON.stringify(b.costs),
          tipKey: b.hotkey ?? "",
        });
        button.onclick = () => this.activate(b);
        this.grid.append(button);
      }
      this.pages.replaceChildren();
      if (this.category) {
        const label = document.createElement("span");
        label.textContent = content.actions.categories[this.category].name;
        this.pages.append(label);
      }
      const pages = commandPageCount(this.menuEntries);
      if (pages > 1) {
        for (const delta of [-1, 1]) {
          const button = document.createElement("button");
          button.textContent = delta < 0 ? "‹" : "›";
          button.setAttribute(
            "aria-label",
            delta < 0 ? "Previous commands" : "Next commands",
          );
          button.onclick = () => {
            this.page = (this.page + delta + pages) % pages;
            this.update(this.current!, true);
          };
          this.pages.append(button);
        }
        this.pages.append(
          document.createTextNode(`${this.page + 1} / ${pages}`),
        );
      }
    }
    this.heading.textContent =
      selected.length > 1
        ? `${selected.length} selected · ${focus ? content.get(focus.definition).name : ""}`
        : focus
          ? content.get(focus.definition).name
          : "Your colony";
    if (focus) {
      const d = content.get(focus.definition);
      if (this.portraitDefinition !== d.id) {
        this.portraitDefinition = d.id;
        this.portrait.innerHTML = iconArt(d.icon);
      }
      Object.assign(this.portrait.dataset, {
        tipName: d.name,
        tipDescription: d.description,
        tipCosts: JSON.stringify(costs(content, d.id)),
      });
      const health = d.body
          ? `${focus.hp} / ${d.body.maxHp} HP · ${d.body.armor} armor`
          : "",
        quantity = focus.item
          ? `${focus.item.quantity} items`
          : focus.resource
            ? `${focus.resource.amount} remaining`
            : "";
      const combat = d.behaviors.combat,
        active = focus.production?.active,
        production = active
          ? `${focus.production!.status} · ${Math.min(100, Math.floor((active.progress / content.get(active.definition).creation!.workTicks) * 100))}%`
          : focus.production?.status;
      this.info.textContent = [
        health,
        combat ? `${combat.damage} damage · ${combat.range} range` : "",
        quantity,
        focus.remembered
          ? "Last seen · current activity unknown"
          : (production ?? focus.job),
        focus.inventory
          ? Object.entries(focus.inventory)
              .map(([id, n]) => `${n} ${content.get(id).name}`)
              .join(" · ")
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      this.portraitDefinition = "";
      this.portrait.replaceChildren();
      this.info.textContent = "Select a settler, army, or workplace.";
    }
    const cardsKey = JSON.stringify(
      selected.map((e) => [e.id, e.definition, e.hp]),
    );
    if (cardsKey !== this.cardsSignature) {
      this.cardsSignature = cardsKey;
      this.cards.replaceChildren();
      for (const e of selected) {
        const d = content.get(e.definition),
          button = document.createElement("button");
        button.innerHTML = iconArt(d.icon);
        button.setAttribute("aria-label", `Focus ${d.name}`);
        Object.assign(button.dataset, {
          tipName: d.name,
          tipDescription: d.description,
        });
        if (d.body) {
          const hp = document.createElement("span");
          hp.className = "rts-unit-hp";
          const fill = document.createElement("i");
          fill.style.width = `${(e.hp! / d.body.maxHp) * 100}%`;
          hp.append(fill);
          button.append(hp);
        }
        const text = document.createElement("small");
        text.textContent = d.body ? `${e.hp}/${d.body.maxHp}` : d.name;
        button.append(text);
        button.onclick = (event) =>
          this.setSelection(
            event.shiftKey
              ? this.selectedIds.filter((id) => id !== e.id)
              : [e.id, ...this.selectedIds.filter((id) => id !== e.id)],
          );
        button.ondblclick = () => this.setSelection([e.id]);
        this.cards.append(button);
      }
    }
    this.cards.hidden = selected.length < 2;
    const queue = queueCard(view, focus?.id, this.owner, content),
      queueKey = JSON.stringify([focus?.id, queue]);
    if (queueKey !== this.queueSignature) {
      this.queueSignature = queueKey;
      this.queues.replaceChildren();
      for (const q of queue) {
        const button = document.createElement("button");
        button.textContent = `${q.name}${q.cancel ? " ×" : ""}`;
        button.disabled = !q.cancel;
        Object.assign(button.dataset, {
          tipName: q.cancel ? `Cancel ${q.name}` : q.name,
          tipDescription: q.cancel
            ? "Remove this queue entry. Delivered goods stay physical."
            : "Production queue. This workplace cannot receive player commands.",
          tipCosts: JSON.stringify(q.costs),
        });
        button.onclick = () => {
          if (q.cancel) this.hooks.action(q.cancel);
        };
        this.queues.append(button);
      }
    }
    const stockSignature = JSON.stringify(view.goods);
    if (this.stockSignature !== stockSignature) {
      this.stockSignature = stockSignature;
      this.stock.replaceChildren();
      for (const row of view.goods ?? []) {
        const item = content.get(row.item),
          badge = document.createElement("span");
        badge.tabIndex = 0;
        badge.innerHTML = iconArt(item.icon);
        const number = document.createElement("b");
        number.textContent = String(row.available);
        badge.append(number);
        Object.assign(badge.dataset, {
          tipName: item.name,
          tipDescription: `${item.description}\n${row.available} available · ${row.reserved} reserved\n${row.stored} stored · ${row.loose} on ground · ${row.inTransit} in transit`,
        });
        this.stock.append(badge);
      }
    }
    if (view.outcome) {
      this.info.textContent =
        view.outcome.winner === null
          ? "Draw — both main forts fell."
          : view.outcome.winner === this.owner
            ? "Victory — the enemy main fort fell."
            : "Defeat — your main fort fell.";
      this.clearMode();
    } else {
      const latest = view.events.at(-1);
      if (
        latest?.type === "command" &&
        view.revision - latest.tick < 100 &&
        !this.targeting
      )
        this.hint.textContent = latest.message;
    }
  }
  destroy() {
    window.removeEventListener("keydown", this.onKey);
    this.tooltips.destroy();
    this.root.remove();
  }
}
