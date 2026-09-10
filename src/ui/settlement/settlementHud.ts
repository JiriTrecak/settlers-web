import { itemStatusCard } from "../../presentation/itemStatus";
import { heroShortcuts } from "../../presentation/heroes";
import { unitOrderCard } from "../../presentation/orderQueue";
import { workforceReserve } from "../../presentation/workforce";
import { HeroBar } from "./heroBar";
import { armorMultiplier } from "../../sim/game/damage";
import { experienceMeter } from "../../presentation/experience";
import { TICK_MS } from "../../shared/match/match";
import { content } from "../../content/builtin";
import { slotOwner, type Owner } from "../../content/schema";
import {
  commandCard,
  inventoryCard,
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
  private readonly heroes: HeroBar;
  private readonly stock = document.createElement("div");
  private readonly heading = document.createElement("h2");
  private readonly portrait = document.createElement("div");
  private readonly info = document.createElement("div");
  private readonly level = document.createElement("div");
  private readonly experience = document.createElement("div");
  private readonly portraitMana = document.createElement("div");
  private readonly portraitHp = document.createElement("div");
  private readonly errorNotice = document.createElement("div");
  private errorTimer: ReturnType<typeof setTimeout> | undefined;
  private lastErrorFact: unknown;
  showError(message: string) {
    this.errorNotice.className = "rts-error visible";
    this.errorNotice.textContent = message;
    this.errorNotice.role = "alert";
    this.root.append(this.errorNotice);
    clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => this.errorNotice.classList.remove("visible"), 2500);
  }
  learnedAbility() { this.navigate(null); }
  private readonly hint = document.createElement("p");
  private readonly cards = document.createElement("div");
  private readonly grid = document.createElement("div");
  private readonly queues = document.createElement("div");
  private readonly statuses = document.createElement("div");
  private statusSignature = "";
  private readonly inventory = document.createElement("div");
  private readonly orders = document.createElement("div");
  private ordersSignature = "";
  private inventorySignature = "";
  private readonly pages = document.createElement("div");
  private readonly mapLabel = document.createElement("span");
  private readonly tooltips: CommandTooltips;
  private readonly owner: Owner;
  private readonly readOnly: boolean;
  private current: SettlementView | null = null;
  private bindings: CommandBinding[] = [];
  private menuEntries: CommandEntry[] = [];
  private category: string | null = null;
  private commandSignature = "";
  private cardsSignature = "";
  private queueSignature = "";
  private page = 0;
  private stockSignature = "";
  private readonly resourceBadges = new Map<string, HTMLElement>();
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
      this.placementRotation =
        (this.placementRotation + (e.shiftKey ? 270 : 90)) % 360;
      this.placement(null);
      this.hooks.mode();
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      this.hooks.home();
      return;
    }
    const binding =
      shortcutCommand(this.menuEntries, this.page, e.key) ??
      this.bindings.find(
        (b) =>
          ["move", "attack", "stop"].includes(b.type) &&
          b.hotkey === e.key.toUpperCase(),
      );
    if (binding) {
      e.preventDefault();
      this.activate(binding);
    }
  };
  constructor(
    host: HTMLElement,
    owner: number | null,
    private readonly hooks: {
      action: (action: Action) => void;
      mode: () => void;
      home: () => void;
      focus: (id: number) => void;
    },
  ) {
    this.owner = owner === null ? "none" : slotOwner(owner);
    this.readOnly = owner === null;
    this.heroes = new HeroBar({
      select: id => this.setSelection([id]),
      focus: id => this.hooks.focus(id),
    });
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
    this.experience.className = "rts-experience";
    this.experience.tabIndex = 0;
    this.experience.setAttribute("role", "progressbar");
    this.portraitMana.className = "rts-portrait-mana";
    this.portraitHp.className = "rts-portrait-health";
    this.hint.className = "rts-notice";
    this.hint.role = "status";
    this.cards.className = "rts-unit-cards";
    this.queues.className = "rts-recruit-queue";
    this.statuses.className = "rts-statuses";
    this.statuses.setAttribute("aria-label", "Active effects and auras");
    this.inventory.className = "rts-inventory";
    this.orders.className = "rts-order-queue";
    this.orders.setAttribute("aria-label", "Queued unit orders");
    copy.append(
      this.heading,
      this.level,
      this.experience,
      this.info,
      this.statuses,
      this.inventory,
      this.orders,
      this.cards,
      this.queues,
      this.hint,
    );
    this.clockHost.className = "rts-clock-slot";
    selection.append(this.portrait, copy, this.clockHost);
    const actions = document.createElement("section");
    actions.className = "rts-actions";
    this.grid.className = "rts-command-grid declarative-commands";
    this.pages.className = "rts-command-pages";
    actions.append(this.stock, this.grid, this.pages);
    dock.append(map, selection, actions);
    this.root.append(this.heroes.root, dock);
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
    if (!binding.enabled) { this.showError(binding.reason ?? "Command unavailable"); return; }
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
    this.heroes.update(heroShortcuts(view, this.owner, content), this.selectedIds);
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
    this.bindings = this.readOnly
      ? []
      : commandCard(view, this.selectedIds, this.owner, content);
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
      Math.min(this.page, commandPageCount(this.menuEntries) - 1),
    );
    // Tick-by-tick progress updates do not recreate command icons.
    const signature = JSON.stringify([
      this.menuEntries.map(({ cooldown, reason, enabled, ...entry }) => entry),
      this.page,
      this.category,
    ]);
    if (signature !== this.commandSignature) {
      this.commandSignature = signature;
      this.grid.replaceChildren();
      for (const { binding: b, column, row } of commandPage(
        this.menuEntries,
        this.page,
      )) {
        const button = document.createElement("button");
        button.className = "rts-command";
        button.setAttribute("aria-disabled", String(!b.enabled));
        button.style.gridColumn = String(column);
        button.style.gridRow = String(row);
        button.innerHTML = iconArt(b.icon);
        if (b.hotkey) { const key = document.createElement("kbd"); key.textContent = b.hotkey; button.append(key); }
        button.dataset.commandId = b.id;
        const cooldown = document.createElement("span");
        cooldown.className = "rts-command-cooldown";
        cooldown.hidden = true;
        cooldown.setAttribute("aria-hidden", "true");
        button.append(cooldown);
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
        button.onclick = () => {
          const current = this.menuEntries.find((entry) => entry.id === b.id);
          if (current) this.activate(current);
        };
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
    for (const button of this.grid.querySelectorAll<HTMLButtonElement>(
      "button[data-command-id]",
    )) {
      const binding = this.menuEntries.find(
          (b) => b.id === button.dataset.commandId,
        ),
        state = binding?.cooldown;
      if (binding) {
        button.setAttribute("aria-disabled", String(!binding.enabled));
        const description = [
          binding.description,
          binding.reason,
          binding.actors.length > 1
            ? `${binding.actors.length} eligible selected actors`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
        if (button.dataset.tipDescription !== description) {
          button.dataset.tipDescription = description;
          this.tooltips.refresh(button);
        }
      }
      const overlay = button.querySelector<HTMLElement>(
        ".rts-command-cooldown",
      )!;
      const active = !!state && state.remainingTicks > 0;
      overlay.hidden = !active;
      button.classList.toggle("is-cooling-down", active);
      if (active) {
        overlay.style.setProperty(
          "--cooldown",
          `${Math.min(1, state.remainingTicks / Math.max(1, state.totalTicks)) * 360}deg`,
        );
        overlay.textContent = String(
          Math.ceil((state.remainingTicks * TICK_MS) / 1000),
        );
      }
    }
    this.heading.textContent = focus ? content.get(focus.definition).name : "";
    this.portrait.hidden = !focus;
    this.hint.hidden = !focus;
    this.level.hidden = !focus;
    this.info.hidden = !focus;
    this.experience.hidden = true;
    if (focus) {
      const d = content.get(focus.definition);
      const xp = experienceMeter(focus, d);
      this.experience.hidden = !xp;
      if (xp) {
        this.experience.style.setProperty(
          "--experience",
          `${xp.fraction * 100}%`,
        );
        this.experience.setAttribute("aria-valuemin", "0");
        this.experience.setAttribute("aria-valuemax", "100");
        this.experience.setAttribute(
          "aria-valuenow",
          String(Math.round(xp.fraction * 100)),
        );
        this.experience.setAttribute("aria-label", xp.label);
        Object.assign(this.experience.dataset, {
          tipName: xp.label,
          tipDescription: xp.description,
        });
      }
      this.level.textContent =
        d.level === undefined ? "" : `Level ${focus.stats?.level ?? d.level}`;
      if (this.portraitDefinition !== d.id) {
        this.portraitDefinition = d.id;
        this.portrait.innerHTML = iconArt(d.icon);
        this.portrait.append(this.portraitHp, this.portraitMana);
      }
      Object.assign(this.portrait.dataset, {
        tipName: d.name,
        tipDescription: d.description,
        tipCosts: JSON.stringify(costs(content, d.id)),
      });
      this.portrait.dataset.mana = String(!!focus.spellcasting);
      this.portraitMana.hidden = !focus.spellcasting;
      this.portraitMana.textContent = focus.spellcasting
        ? `${focus.spellcasting.mana} / ${focus.stats!.maxMana}`
        : "";
      this.portraitHp.hidden = !d.body;
      if (d.body) {
        this.portraitHp.textContent = `${focus.hp ?? 0} / ${focus.stats?.maxHp ?? d.body.maxHp}`;
        this.portraitHp.style.color = `#${healthPipState(
          focus.hp ?? 0,
          focus.stats?.maxHp ?? d.body.maxHp,
          d.kind === "building",
        )
          .color.toString(16)
          .padStart(6, "0")}`;
      }
      const statKey = `${d.id}/${focus.stats?.damage}/${focus.stats?.armor}/${focus.stats?.cooldownTicks}`;
      if (this.info.dataset.definition !== statKey) {
        this.info.dataset.definition = statKey;
        this.info.replaceChildren();
        if (d.body) {
          const armor = content.rules.armorTypes[d.body.armorType];
          for (const stat of [
            {
              name: "Damage",
              value: focus.stats?.damage ?? d.behaviors.combat?.damage ?? 0,
              icon: "icon.action.attack",
              description: d.behaviors.combat
                ? `${content.rules.damageTypes[d.behaviors.combat.damageType].name}. ${Number(((focus.stats?.cooldownTicks ?? d.behaviors.combat.cooldownTicks) * TICK_MS / 1000).toFixed(3))}s between attacks. Damage shown before target armor and resistance.`
                : "This unit has no attack.",
            },
            {
              name: "Armor",
              value: focus.stats?.armor ?? d.body.armor,
              icon: armor.icon,
              description: `${armor.name}. Armor points reduce ordinary attack damage by ${((1-armorMultiplier(content.rules,focus.stats?.armor ?? d.body.armor))*100).toFixed(1)}%.\n${Object.entries(content.rules.damageTypes).map(([id,t]) => `${t.name}: ${content.rules.damageMultipliers[id][d.body!.armorType]/10}% class damage${t.appliesArmor ? " before armor" : "; bypasses armor points"}`).join("\n")}`,
            },
          ]) {
            const row = document.createElement("div");
            row.className = "rts-selection-stat";
            row.innerHTML = iconArt(stat.icon);
            row.tabIndex = 0;
            Object.assign(row.dataset, {
              tipName: stat.name,
              tipDescription: stat.description,
            });
            const text = document.createElement("div"),
              label = document.createElement("span"),
              value = document.createElement("strong");
            label.textContent = stat.name;
            value.textContent = String(Number(stat.value.toFixed(1)));
            text.append(label, value);
            row.append(text);
            this.info.append(row);
          }
        }
      }
    } else {
      this.portraitDefinition = "";
      this.portrait.replaceChildren();
      for (const key of Object.keys(this.portrait.dataset))
        delete this.portrait.dataset[key];
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
          fill.style.width = `${(e.hp! / (e.stats?.maxHp ?? d.body.maxHp)) * 100}%`;
          fill.style.backgroundColor = `#${healthPipState(
            e.hp ?? 0,
            e.stats?.maxHp ?? d.body.maxHp,
            false,
          )
            .color.toString(16)
            .padStart(6, "0")}`;
          hp.append(fill);
          button.append(hp);
        }
        const text = document.createElement("small");
        text.textContent = d.body
          ? `${e.hp}/${e.stats?.maxHp ?? d.body.maxHp}`
          : d.name;
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
    const orders = unitOrderCard(focus, view, content), ordersKey = JSON.stringify(orders);
    this.orders.hidden = !orders.length;
    if (ordersKey !== this.ordersSignature) {
      this.ordersSignature = ordersKey;
      this.orders.replaceChildren();
      for (const order of orders) {
        const tile = document.createElement("span");
        tile.tabIndex = 0;
        tile.innerHTML = iconArt(order.icon);
        tile.setAttribute("aria-label", `${order.index}. ${order.name}`);
        Object.assign(tile.dataset, {tipName: order.name, tipDescription: order.description});
        const index = document.createElement("small");
        index.textContent = String(order.index);
        tile.append(index);
        this.orders.append(tile);
      }
    }
    const statuses = itemStatusCard(focus, view.revision, content), statusKey = JSON.stringify(statuses);
    this.statuses.hidden = !statuses.length;
    if (statusKey !== this.statusSignature) {
      this.statusSignature = statusKey;
      this.statuses.replaceChildren(...statuses.map(status => {
        const badge = document.createElement("span");
        badge.tabIndex = 0; badge.innerHTML = iconArt(status.icon);
        badge.setAttribute("aria-label", status.name);
        Object.assign(badge.dataset, {tipName:status.name, tipDescription:status.description});
        return badge;
      }));
    }
    const inventory = inventoryCard(
        view,
        focus?.id,
        this.owner,
        content,
        this.readOnly,
      ),
      inventoryKey = JSON.stringify(inventory);
    this.inventory.hidden = !inventory.length;
    if (inventoryKey !== this.inventorySignature) {
      this.inventorySignature = inventoryKey;
      this.inventory.replaceChildren();
      for (const item of inventory) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute(
          "aria-label",
          `${item.name}, slot ${item.slot + 1}`,
        );
        if (item.icon) button.innerHTML = iconArt(item.icon);
        if (item.tier) button.dataset.tier = String(item.tier);
        if (item.charges !== undefined || item.cooldown) {
          const count = document.createElement("small");
          count.textContent = item.cooldown ? `${item.cooldown}s` : String(item.charges);
          button.append(count);
        }
        Object.assign(button.dataset, {
          tipName: item.name,
          tipDescription:
            (item.tier ? `Tier ${item.tier}. ` : "") + item.description + (item.charges !== undefined ? ` ${item.charges} charges remaining.` : "") + (item.cooldown ? ` Cooldown: ${item.cooldown}s.` : "") +
            (item.drop
              ? item.use
                ? " Click to use. Right-click to drop."
                : " Equipped. Right-click to drop."
              : ""),
        });
        button.disabled = !item.definition || !item.drop;
        button.onclick = () => {
          if (item.use) this.hooks.action(item.use);
        };
        button.oncontextmenu = (event) => {
          event.preventDefault();
          if (item.drop) this.hooks.action(item.drop);
        };
        this.inventory.append(button);
      }
    }
    const queue = queueCard(
        view,
        focus?.id,
        this.owner,
        content,
        this.readOnly,
      ),
      queueKey = JSON.stringify([
        focus?.id,
        queue.map(q => ({...q, progress: undefined})),
        focus?.production?.status,
        Math.floor((focus?.production?.active?.progress ?? 0) / 40),
        focus?.gathering,
        focus?.resource?.amount,
        focus?.upgrade?.target,
        Math.floor((focus?.upgrade?.progress ?? 0) / 40),
      ]);
    if (queueKey !== this.queueSignature) {
      this.queueSignature = queueKey;
      this.queues.replaceChildren();
      if (focus && !focus.remembered) {
        const summary = document.createElement("span");
        summary.className = "rts-production-summary";
        const production = content.get(focus.definition).behaviors.production;
        if (focus.upgrade) {
          const recipe = content.get(focus.definition).upgrade!;
          summary.textContent = `${content.get(focus.upgrade.target).name} · ${Math.floor(focus.upgrade.progress / 40)}/${recipe.workTicks / 40}s · Worker spawning paused`;
        } else if (focus.production && production) {
          const population = production.population;
          summary.textContent = population
            ? `${focus.production.status} · ${Math.floor((focus.production.active?.progress ?? 0) / 40)}/${population.intervalTicks / 40}s · +${population.capacity} worker capacity`
            : queue.length
              ? focus.production.status
              : "";
        } else if (focus.gathering) {
          const resource = content.definitions.find(
            (d) =>
              d.creation?.method === "harvest" &&
              d.creation.source === focus.definition,
          );
          summary.textContent = `${focus.gathering.workers}/${focus.gathering.capacity} workers · ${focus.resource?.amount ?? 0} ${resource?.name ?? "resources"} remaining`;
        }
        if (summary.textContent) this.queues.append(summary);
      }
      for (const q of queue) {
        const button = document.createElement("button");
        button.className = "rts-queued-task";
        button.innerHTML = iconArt(q.icon);
        button.setAttribute("aria-label", q.cancel ? `Cancel ${q.name}` : q.name);
        if (q.progress !== null) {
          const meter = document.createElement("span");
          meter.className = "rts-queued-progress";
          button.append(meter);
        }
        button.disabled = !q.cancel;
        Object.assign(button.dataset, {
          tipName: q.cancel ? `Cancel ${q.name}` : q.name,
          tipDescription: q.cancel
            ? q.cancel.type === "cancelResearch" ? "Cancel this research and refund its full price to the Mound." : "Cancel this recruit. Reserved resources return to the Mound and the worker is released."
            : "Queued task. This workplace cannot receive player commands.",
          tipCosts: JSON.stringify(q.costs),
        });
        button.onclick = () => {
          if (q.cancel) this.hooks.action(q.cancel);
        };
        this.queues.append(button);
      }
    }
    // Keep the target button stable while progress advances: rebuilding it can lose
    // a pointer-down, keyboard focus or an open cancellation tooltip.
    const taskButtons = this.queues.querySelectorAll<HTMLButtonElement>(".rts-queued-task");
    queue.forEach((q, index) => {
      const button = taskButtons[index];
      const meter = button?.querySelector<HTMLElement>(".rts-queued-progress");
      if (meter && q.progress !== null) {
        const percent = Math.floor(q.progress * 100);
        meter.style.width = `${percent}%`;
        button.setAttribute("aria-label", `${q.cancel ? "Cancel " : ""}${q.name} · ${percent}%`);
        button.dataset.tipName = `${q.cancel ? "Cancel " : ""}${q.name} · ${percent}%`;
      }
    });
    const stockSignature = JSON.stringify([view.goods, view.population]);
    if (this.stockSignature !== stockSignature) {
      this.stockSignature = stockSignature;
      const shown = new Set((view.goods ?? []).map(row => row.item));
      for (const [id, badge] of this.resourceBadges) {
        if (shown.has(id)) continue;
        this.tooltips.hide();
        badge.remove();
        this.resourceBadges.delete(id);
      }
      for (const row of view.goods ?? []) {
        const item = content.get(row.item);
        let badge = this.resourceBadges.get(row.item);
        if (!badge) {
          badge = document.createElement("span");
          badge.tabIndex = 0;
          badge.innerHTML = iconArt(item.icon) + "<b></b>";
          this.resourceBadges.set(row.item, badge);
          this.stock.insertBefore(badge, this.stock.querySelector("[data-population]"));
        }
        badge.querySelector("b")!.textContent = String(row.available);
        badge.setAttribute("aria-label", `${item.name}: ${row.available} available`);
        Object.assign(badge.dataset, {
          tipName: item.name,
          tipDescription: `${item.description}\n${row.available} available · ${row.reserved} reserved\n${row.stored} stored · ${row.inTransit} being carried`,
        });
        this.tooltips.refresh(badge);
      }
    }
    // Resource and population badges share the same declarative icon/tooltip path.
    if (view.population) {
      let badge = this.stock.querySelector<HTMLElement>("[data-population]");
      if (!badge) {
        badge = document.createElement("span");
        badge.dataset.population = "true";
        badge.tabIndex = 0;
        badge.innerHTML =
          iconArt(
            content.get(
              content.rules.startingSetup.units.find(
                (u) => content.get(u.definition).behaviors.work,
              )!.definition,
            ).icon,
          ) + "<b></b>";
        this.stock.append(badge);
      }
      const reserve = workforceReserve(view.population);
      const description = `${reserve.available} ready to recruit now.\n${reserve.replenishing} more can spawn.\n${reserve.allocation} free workers after replenishment, keeping current assignments.\nAssigned workers are protected from recruitment.`;
      if (badge.dataset.tipDescription !== description) {
        badge.querySelector("b")!.textContent = `${reserve.available}/${reserve.allocation}`;
        badge.setAttribute("aria-label", `${reserve.available} workers available for recruitment, ${reserve.allocation} after replenishment`);
        badge.dataset.tipName = "Available workers";
        badge.dataset.tipDescription = description;
        this.tooltips.refresh(badge);
      }
    } else {
      const badge = this.stock.querySelector("[data-population]");
      if (badge) { this.tooltips.hide(); badge.remove(); }
    }
    this.stock.hidden = !this.stock.childElementCount;
    if (view.outcome) {
      this.info.textContent =
        view.outcome.winner === null
          ? "Draw — both main forts fell."
          : this.readOnly
            ? `Player ${view.outcome.winner.split(".")[1]} wins — the rival Mound fell.`
            : view.outcome.winner === this.owner
              ? "Victory — the enemy main fort fell."
              : "Defeat — your main fort fell.";
      this.clearMode();
    } else {
      const latest = view.events.filter(e => e.type === "error").at(-1);
      const key = latest ? JSON.stringify(latest) : null;
      if (latest && key !== this.lastErrorFact && view.revision - latest.tick < 5) {
        this.lastErrorFact = key;
        this.showError(latest.message);
      }
    }
  }
  destroy() {
    clearTimeout(this.errorTimer);
    window.removeEventListener("keydown", this.onKey);
    this.tooltips.destroy();
    this.root.remove();
  }
}
