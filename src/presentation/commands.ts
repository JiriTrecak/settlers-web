import type { ContentRegistry } from "../content/registry";
import type { ActionName, Owner } from "../content/schema";
import type { Action } from "../shared/types/types";
import type { EntityView, SettlementView } from "../sim/game/observation";

export type CostView = {
  name: string;
  icon: string;
  amount: number;
  kind: "item" | "unit";
};
export type CommandBinding = {
  id: string;
  type: ActionName;
  name: string;
  description: string;
  icon: string;
  costs: CostView[];
  priority: number;
  category?: string;
  hotkey?: string;
  actors: number[];
  targetDefinition?: string;
  enabled: boolean;
  reason?: string;
  immediate?: Action;
};
export type NavigationBinding = Omit<CommandBinding, "type" | "immediate"> & {
  type: "category" | "back";
  destination: string | null;
};
export type CommandEntry = CommandBinding | NavigationBinding;

/** Local presentation navigation; these entries never become simulation commands. */
export function commandMenu(
  bindings: readonly CommandBinding[],
  category: string | null,
  registry: ContentRegistry,
): { category: string | null; entries: CommandEntry[] } {
  const categories = registry.actions.categories;
  const populated = new Set<string>();
  for (const binding of bindings) {
    let id = binding.category;
    while (id) {
      populated.add(id);
      id = categories[id]?.parent;
    }
  }
  if (category && !populated.has(category)) category = null;
  const entries: CommandEntry[] = bindings.filter(b => (b.category ?? null) === category);
  for (const [id, meta] of Object.entries(categories)) {
    if ((meta.parent ?? null) !== category || !populated.has(id)) continue;
    entries.push({ ...meta, id: `category:${id}`, type: "category", destination: id,
      costs: [], actors: [], enabled: true });
  }
  entries.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (category) entries.unshift({
    id: "navigation:back", type: "back", destination: categories[category].parent ?? null,
    name: "Back", description: "Return to the previous command category. Escape also goes back.",
    icon: registry.actions.actions.cancel.icon, costs: [], actors: [], priority: 0, enabled: true,
  });
  return { category, entries };
}
export const COMMANDS_PER_PAGE = 12;
export function commandPage(bindings: readonly CommandEntry[], page: number) {
  const back = bindings.find(b => b.type === "back");
  const rest = bindings.filter(b => b.type !== "back");
  const size = COMMANDS_PER_PAGE - (back ? 1 : 0);
  const slots = rest.slice(page * size, (page + 1) * size)
    .map((binding, i) => ({
      binding,
      column: 4 - (i % 4),
      row: 1 + Math.floor(i / 4),
    }));
  if (back) slots.push({ binding: back, column: 1, row: 3 });
  return slots;
}
export function commandPageCount(bindings: readonly CommandEntry[]) {
  const back = bindings.some(b => b.type === "back") ? 1 : 0;
  return Math.max(1, Math.ceil((bindings.length - back) / (COMMANDS_PER_PAGE - back)));
}
export function shortcutCommand(
  bindings: readonly CommandEntry[],
  page: number,
  key: string,
) {
  return [...commandPage(bindings, page).map(s => s.binding), ...bindings.filter(b =>
    ["move", "attack", "stop"].includes(b.type))].find(
    (b) =>
      b.hotkey === key.toUpperCase() &&
      b.type !== "back",
  );
}
/** A queue belongs to the focused workplace; inspection need not grant cancellation. */
export function queueCard(
  view: SettlementView,
  focusId: number | undefined,
  owner: Owner,
  registry: ContentRegistry,
) {
  const focus = view.entities.find((e) => e.id === focusId);
  if (!focus?.production || focus.remembered || focus.owner !== owner)
    return [];
  const controllable =
    registry.get(focus.definition).behaviors.playerControl && !view.outcome;
  return focus.production.queue.map((q) => {
    const d = registry.get(q.definition);
    return {
      id: q.id,
      name: d.name,
      costs: costs(registry, d.id),
      cancel: controllable
        ? { type: "cancel" as const, actor: focus.id, queue: q.id }
        : null,
    };
  });
}
export function costs(registry: ContentRegistry, id: string): CostView[] {
  const d = registry.get(id),
    c = d.creation;
  if (!c) return [];
  const result: CostView[] = c.items.map((p) => {
    const item = registry.get(p.item);
    return { name: item.name, icon: item.icon, amount: p.amount, kind: "item" };
  });
  if (c.method === "recruit") {
    const unit = registry.get(c.unitInput);
    result.push({ name: unit.name, icon: unit.icon, amount: 1, kind: "unit" });
  }
  return result;
}
export function areaSelection(
  entities: readonly EntityView[],
  owner: Owner,
  registry: ContentRegistry,
): number[] {
  const own = entities.filter(
    (e) =>
      e.owner === owner &&
      e.unit &&
      !e.unit.contained &&
      registry.get(e.definition).selectable !== false &&
      registry.get(e.definition).behaviors.playerControl,
  );
  const army = own.filter(
    (e) => registry.get(e.definition).selectionClass === "army",
  );
  return (
    army.length
      ? army
      : own.filter((e) => registry.get(e.definition).behaviors.work)
  )
    .map((e) => e.id)
    .sort((a, b) => a - b);
}
/** Renderer-neutral command discovery. Never reads live simulation records. */
export function commandCard(
  view: SettlementView,
  selection: readonly number[],
  owner: Owner,
  registry: ContentRegistry,
): CommandBinding[] {
  const selected = selection
      .map((id) => view.entities.find((e) => e.id === id))
      .filter((e): e is EntityView => !!e),
    focus = selected[0];
  if (!focus) return [];
  const controlled = selected.filter(
    (e) =>
      e.owner === owner &&
      !e.remembered &&
      registry.get(e.definition).behaviors.playerControl &&
      !e.unit?.contained,
  );
  const result: CommandBinding[] = [];
  const add = (
    type: ActionName,
    actors: EntityView[],
    targetDefinition?: string,
    immediate?: Action,
  ) => {
    if (!actors.length) return;
    const meta = registry.actions.actions[type],
      id = targetDefinition ? `${type}:${targetDefinition}` : type,
      target = targetDefinition ? registry.get(targetDefinition) : null,
      override = registry.actions.overrides[id];
    result.push({
      id,
      type,
      name: target?.name ?? meta.name,
      description: target?.description ?? meta.description,
      icon: target?.icon ?? meta.icon,
      costs: target ? costs(registry, target.id) : [],
      priority: override?.priority ?? meta.priority,
      hotkey: override?.hotkey ?? meta.hotkey,
      category: override?.category === null ? undefined : override?.category ?? target?.category ?? meta.category,
      actors: actors.map((e) => e.id),
      targetDefinition,
      enabled: !view.outcome,
      ...(immediate ? { immediate } : {}),
    });
  };
  if (registry.get(focus.definition).kind === "building") {
    if (!controlled.includes(focus)) return [];
    const d = registry.get(focus.definition),
      p = focus.production,
      policy = d.behaviors.production;
    if (focus.construction) {
      add("cancel", [focus], undefined, { type: "cancel", actor: focus.id });
      return result;
    }
    if (p && policy) {
      if (policy.mode === "queued")
        for (const output of policy.outputs) {
          add("produce", [focus], output, {
            type: "produce",
            actor: focus.id,
            definition: output,
          });
          if (p.queue.length >= policy.queueCapacity!) {
            const b = result.at(-1)!;
            b.enabled = false;
            b.reason = "Queue full";
          }
        }
      if (policy.outputs.some((id) => registry.get(id).kind === "unit"))
        add("rally", [focus]);
      add("pause", [focus], undefined, {
        type: "pause",
        actor: focus.id,
        paused: !p.paused,
      });
      if (p.paused) result.at(-1)!.name = "Resume production";
    }
  } else if (focus.unit) {
    const units = controlled.filter((e) => e.unit),
      movers = units.filter(
        (e) => registry.get(e.definition).behaviors.movement,
      ),
      army = units.filter((e) => registry.get(e.definition).behaviors.combat);
    add("move", movers);
    add("attack", army);
    add("stop", movers, undefined, {
      type: "stop",
      actors: movers.map((e) => e.id),
    });
    const buildIds = new Set(
      units.flatMap(
        (e) => registry.get(e.definition).behaviors.work?.builds ?? [],
      ),
    );
    for (const id of buildIds) {
      const workers = units.filter((e) =>
        registry.get(e.definition).behaviors.work?.builds.includes(id),
      );
      const actor =
        workers.find((e) => e.id === focus.id) ??
        workers.sort((a, b) => a.id - b.id)[0]!;
      add("build", [actor], id);
    }
  }
  return result.sort(
    (a, b) =>
      b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
