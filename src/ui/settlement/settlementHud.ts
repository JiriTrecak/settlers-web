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
import { healthPipState } from "../../presentation/health";
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
  private readonly info = document.createElement("div");
  private readonly level = document.createElement("div");
  private readonly portraitHp = document.createElement("div");
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
  placementRotation = 0;
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
    this.placementRotation = 0;
    this.hooks.mode();
    this.hint.textContent = "";
  }
  placement(message: string | null) {
    if (this.mode)
      this.hint.textContent = `${message ?? "Click to order construction."} R / Shift+R: rotate (${this.placementRotation}°). Escape cancels.`;
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
    if (e.key === "Escape" && this.targeting) {
      e.preventDefault();
      this.clearMode();
      this.tooltips.hide();
      return;
    }
    if (this.mode && e.key.toLowerCase() === "r") {
      e.preventDefault();
      this.placementRotation = (this.placementRotation + (e.shiftKey ? 270 : 90)) % 360;
      this.placement(null);
      this.hooks.mode();
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
    this.level.className = "rts-selection-level";
    this.portraitHp.className = "rts-portrait-health";
    this.hint.className = "rts-notice";
    this.hint.role = "status";
    this.cards.className = "rts-unit-cards";
    this.queues.className = "rts-recruit-queue";
    copy.append(this.heading, this.level, this.info, this.cards, this.queues, this.hint);
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
    if (this.mode) this.placement(null);
    this.hooks.mode();
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
    this.heading.textContent = focus ? content.get(focus.definition).name : "";
    this.portrait.hidden = !focus;
    this.hint.hidden = !focus;
    this.level.hidden = !focus;
    this.info.hidden = !focus;
    if (focus) {
      const d = content.get(focus.definition);
      this.level.textContent = d.level === undefined ? "" : `Level ${d.level}`;
      if (this.portraitDefinition !== d.id) {
        this.portraitDefinition = d.id;
        this.portrait.innerHTML = iconArt(d.icon);
        this.portrait.append(this.portraitHp);
      }
      Object.assign(this.portrait.dataset, {
        tipName: d.name, tipDescription: d.description,
        tipCosts: JSON.stringify(costs(content, d.id)),
      });
      this.portraitHp.hidden = !d.body;
      if (d.body) {
        this.portraitHp.textContent = `${focus.hp ?? 0} / ${d.body.maxHp}`;
        this.portraitHp.style.color = `#${healthPipState(focus.hp ?? 0, d.body.maxHp, d.kind === "building").color.toString(16).padStart(6, "0")}`;
      }
      if (this.info.dataset.definition !== d.id) {
        this.info.dataset.definition = d.id;
        this.info.replaceChildren();
        if (d.body) {
          const armor = content.rules.armorTypes[d.body.armorType];
          for (const stat of [
            { name: "Damage", value: d.behaviors.combat?.damage ?? 0, icon: "icon.action.attack", description: "Damage per attack." },
            { name: "Armor", value: d.body.armor, icon: armor.icon, description: armor.name },
          ]) {
            const row = document.createElement("div");
            row.className = "rts-selection-stat";
            row.innerHTML = iconArt(stat.icon);
            row.tabIndex = 0;
            Object.assign(row.dataset, { tipName: stat.name, tipDescription: stat.description });
            const text = document.createElement("div"), label = document.createElement("span"), value = document.createElement("strong");
            label.textContent = stat.name; value.textContent = String(stat.value);
            text.append(label, value); row.append(text); this.info.append(row);
          }
        }
      }
    } else {
      this.portraitDefinition = "";
      this.portrait.replaceChildren();
      for (const key of Object.keys(this.portrait.dataset)) delete this.portrait.dataset[key];
      this.level.textContent = "";
      this.info.replaceChildren();
      delete this.info.dataset.definition;
      this.hint.textContent = "";
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
          fill.style.backgroundColor = `#${healthPipState(e.hp ?? 0, d.body.maxHp, false).color.toString(16).padStart(6, "0")}`;
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
