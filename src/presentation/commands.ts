import type { ContentRegistry } from "../content/registry";
import type { ActionName, Owner } from "../content/schema";
import type { Action } from "../shared/types/types";
import type { EntityView, SettlementView } from "../sim/game/observation";
import { TICK_MS } from "../shared/match/match";

export type CostView = {
  name: string;
  icon: string;
  amount: number;
  kind: "item" | "unit" | "mana";
};

export function inventoryCard(view:SettlementView,focusId:number|undefined,owner:Owner,registry:ContentRegistry,readOnly=false) {
  const hero=view.entities.find(e=>e.id===focusId);
  if(!hero?.equipment || (!readOnly && hero.owner!==owner) || hero.remembered)return [];
  const controllable=!readOnly && !!registry.get(hero.definition).behaviors.playerControl && !view.outcome;
  return hero.equipment.map((id,slot)=>{
    const d=id ? registry.get(id) : null;
    return {slot,definition:id,name:d?.name ?? "Empty inventory slot",description:d?.description ?? "",icon:d?.icon ?? null,
      use:controllable && d?.itemEffect?.type==="consumable" ? {type:"useItem" as const,actor:hero.id,slot} : null,
      drop:controllable && d ? {type:"dropItem" as const,actor:hero.id,slot} : null};
  });
}
export type CommandBinding = {
  id: string;
  type: ActionName | "cast" | "learnAbility" | "revive";
  ability?:string;
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
  cooldown?: { remainingTicks: number; totalTicks: number };
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
    ...registry.actions.navigation.back, costs: [], actors: [], enabled: true,
  });
  return { category, entries };
}
export const COMMANDS_PER_PAGE = 12;
export function commandPage(bindings: readonly CommandEntry[], page: number) {
  const back = bindings.find(b => b.type === "back");
  const rest = bindings.filter(b => b.type !== "back");
  const size = COMMANDS_PER_PAGE - (back ? 1 : 0);
  const slots = rest.slice(page * size, (page + 1) * size)
    .map((binding, i) => {
      const slot = back && i >= 8 ? i + 1 : i; // Slot 9 is reserved for Back.
      return { binding, column: 1 + slot % 4, row: 1 + Math.floor(slot / 4) };
    });
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
      b.hotkey?.toUpperCase() === key.toUpperCase(),
  );
}
/** A queue belongs to the focused workplace; inspection need not grant cancellation. */
export function queueCard(
  view: SettlementView,
  focusId: number | undefined,
  owner: Owner,
  registry: ContentRegistry,
  readOnly = false,
) {
  const focus = view.entities.find((e) => e.id === focusId);
  if(focus?.revival&&(readOnly || focus.owner===owner)&&!focus.remembered){
    return focus.revival.queue.flatMap(q=>{const hero=view.fallenHeroes?.find(h=>h.id===q.hero);return hero?[{id:q.hero,name:`Revive ${registry.get(hero.definition).name} · ${Math.floor(q.progress/registry.get(focus.definition).behaviors.revival!.workTicks*100)}%`,costs:[] as CostView[],cancel:!readOnly && !view.outcome?{type:"cancelRevival" as const,actor:focus.id,hero:q.hero}:null}]:[];});
  }
  if (!focus?.production || focus.remembered || (!readOnly && focus.owner !== owner))
    return [];
  const controllable =
    !readOnly && registry.get(focus.definition).behaviors.playerControl && !view.outcome;
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
    if(d.behaviors.revival&&focus.revival){
      for(const hero of view.fallenHeroes??[]){
        const definition=registry.get(hero.definition),queued=view.entities.some(b=>b.revival?.queue.some(q=>q.hero===hero.id));
        const reason=queued?'Hero is already being revived':focus.revival.queue.length>=d.behaviors.revival.queueCapacity?'Revival queue is full':undefined;
        result.push({id:`revive:${hero.id}`,type:'revive',name:`Revive ${definition.name}`,description:`Return this level ${hero.stats?.level??1} hero with their items and learned abilities. ${d.behaviors.revival.workTicks*TICK_MS/1000}s.`,icon:definition.icon,costs:[],priority:100,actors:[focus.id],enabled:!view.outcome&&!reason,reason,immediate:{type:'revive',actor:focus.id,hero:hero.id}});
      }
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
    const caster=controlled.find(e=>e.spellcasting);
    if(caster?.spellcasting){
      const state=caster.spellcasting,policy=registry.get(caster.definition).behaviors.spellcasting!;
      const level=caster.stats?.level??1,points=level-Object.values(state.learned).reduce((n,r)=>n+r,0);
      for(const id of policy.abilities){
        const spell=registry.rules.spells[id],learned=state.learned[id]??0,rank=spell.ranks[Math.max(0,learned-1)];
        const remaining=Math.max(0,(state.cooldowns[id]??0)-view.revision);
        const reason=!learned?'Learn this ability first':state.pending?'Casting':remaining?`Ready in ${Math.ceil(remaining*TICK_MS/1000)}s`:state.mana<rank.mana?'Not enough mana':undefined;
        result.push({id:`cast:${id}`,type:'cast',ability:id,name:spell.name,icon:spell.icon,hotkey:spell.hotkey,priority:spell.priority,
          description:`${spell.description}\nRank ${learned}/${spell.ranks.length} · ${rank.cooldownTicks*TICK_MS/1000}s cooldown`,
          cooldown:learned?{remainingTicks:remaining,totalTicks:rank.cooldownTicks}:undefined,
          costs:[{kind:'mana',name:'Mana',icon:policy.manaIcon,amount:rank.mana}],actors:[caster.id],enabled:!view.outcome&&!reason,reason,
          ...(spell.target==='self'?{immediate:{type:'cast',actor:caster.id,ability:id} as Action}:{})});
        const next=spell.ranks[learned];
        if(next){
          const reason=points<1?'No unspent skill points':level<next.requiredLevel?`Requires level ${next.requiredLevel}`:undefined;
          result.push({id:`learn:${id}`,type:'learnAbility',ability:id,name:`${spell.name} — Rank ${learned+1}`,description:`${spell.description}\nRequires level ${next.requiredLevel}. ${points} skill points available.`,
            icon:spell.icon,hotkey:spell.hotkey,priority:spell.priority,category:policy.learningCategory,costs:[],actors:[caster.id],enabled:!view.outcome&&!reason,reason,
            immediate:{type:'learnAbility',actor:caster.id,ability:id}});
        }
      }
    }
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
