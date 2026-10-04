import {value} from '../content/abilities/schema';
import { supplyAdmission } from "../sim/game/supply";
import {cameraModeName,nextCameraMode,type UnitCameraMode} from '../shared/camera/modes';
import {prioritizeSelection} from "./selection";
import type { ContentRegistry } from "../content/registry";
import { prerequisiteReason } from "../content/prerequisites";
import type { ActionName, Owner } from "../content/schema";
import type { Action } from "../shared/types/types";
import type { EntityView, SettlementView } from "../sim/game/observation";
import { TICK_MS } from "../shared/match/match";

export type CostView = {
  name: string;
  icon: string;
  amount: number;
  kind: "item" | "supply" | "mana";
};

export function inventoryCard(view:SettlementView,focusId:number|undefined,owner:Owner,registry:ContentRegistry,readOnly=false) {
  const hero=view.entities.find(e=>e.id===focusId);
  if(!hero?.equipment || (!readOnly && hero.owner!==owner) || hero.remembered)return [];
  const controllable=!readOnly && !!registry.get(hero.definition).behaviors.playerControl && !view.outcome;
  return hero.equipment.map((id,slot)=>{
    const d=id ? registry.get(id) : null;
    const state=hero.equipmentState?.[slot], effect=d?.itemEffect;
    const charges=state?.charges ?? effect?.active?.charges ?? effect?.rescue?.charges;
    const cooldown=Math.max(0, Math.ceil(((state?.readyTick ?? 0)-view.revision)/40));
    return {slot,charges,cooldown,tier:d?.itemTier,definition:id,name:d?.name ?? "Empty inventory slot",description:d?.description ?? "",icon:d?.icon ?? null,
      use:controllable && (effect?.type==="consumable" || effect?.active) && !cooldown ? {type:"useItem" as const,actor:hero.id,slot} : null,
      drop:controllable && d ? {type:"dropItem" as const,actor:hero.id,slot} : null};
  });
}
export type CommandBinding = {
  id: string;
  type: ActionName | "castAbility" | "learnAbility" | "revive" | "upgrade" | "cancelUpgrade" | "camera";
  ability?:string;
  binding?:string;
  name: string;
  description: string;
  icon: string;
  costs: CostView[];
  priority: number;
  placement?: "banner" | "bottom-row";
  column?: number;
  category?: string;
  hotkey?: string;
  actors: number[];
  targetDefinition?: string;
  enabled: boolean;
  cooldown?: { remainingTicks: number; totalTicks: number };
  reason?: string;
  immediate?: Action;
  alternate?: Action;
  autocast?: boolean;
};
export type NavigationBinding = Omit<CommandBinding, "type" | "immediate"> & {
  type: "category" | "back";
  destination: string | null;
};
export type CommandEntry = CommandBinding | NavigationBinding;

/** Camera controls remain available when inspecting a visible unit as an observer. */
export function unitCameraCommand(view:SettlementView,focusId:number|undefined,registry:ContentRegistry,mode:UnitCameraMode):CommandBinding[] {
  const focus=view.entities.find(e=>e.id===focusId),meta=registry.actions.navigation.camera;
  if(!meta||!focus?.unit||focus.remembered||focus.unit.contained||(focus.hp!==null&&focus.hp<=0))return [];
  return [{...meta,id:'camera',type:'camera',name:`Camera: ${cameraModeName[mode]}`,description:`${meta.description}\nNext: ${cameraModeName[nextCameraMode(mode)]}.`,costs:[],actors:[focus.id],enabled:true}];
}
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
/** Reserved presentation rows do not depend on how many ordinary commands are present. */
function commandLayout(bindings: readonly CommandEntry[]) {
  const back = bindings.find(b => b.type === "back");
  const banners = bindings.filter(b => b.type !== "back" && b.placement === "banner");
  const bottom = bindings.filter(b => b.type !== "back" && b.placement === "bottom-row");
  const ordinary = bindings.filter(b => b.type !== "back" && !b.placement);
  return { back, banners, bottom, ordinary,
    ordinarySize: bottom.length ? 8 : COMMANDS_PER_PAGE - (back ? 1 : 0),
    bottomSize: back ? 3 : 4 };
}
export function commandPage(bindings: readonly CommandEntry[], page: number) {
  const { back, banners, bottom, ordinary, ordinarySize, bottomSize } = commandLayout(bindings);
  const slots = ordinary.slice(page * ordinarySize, (page + 1) * ordinarySize)
    .map((binding, i) => {
      const slot = back && i >= 8 ? i + 1 : i; // Slot 9 is reserved for Back.
      return { binding, column: 1 + slot % 4, row: 1 + Math.floor(slot / 4) };
    });
  bottom.slice(page * bottomSize, (page + 1) * bottomSize).forEach((binding, i) =>
    slots.push({ binding, column: binding.column ?? 1 + (back ? 1 : 0) + i, row: 3 }));
  if (back) slots.push({ binding: back, column: 1, row: 3 });
  banners.forEach((binding, index) => slots.push({ binding, column: 1, row: 4 + index }));
  return slots;
}
export function commandPageCount(bindings: readonly CommandEntry[]) {
  const { ordinary, ordinarySize, bottom, bottomSize } = commandLayout(bindings);
  return Math.max(1, Math.ceil(ordinary.length / ordinarySize), Math.ceil(bottom.length / bottomSize));
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
  if (focus?.research && !focus.remembered && (readOnly || focus.owner === owner)) {
    return focus.research.queue.map((q, index) => {
      const r = registry.rules.research[q.id];
      return {id: index + 1, icon: r.icon, progress: q.progress / r.workTicks, name: r.name, costs: r.items.map(p => ({kind: "item" as const, name: registry.get(p.item).name, icon: registry.get(p.item).icon, amount: p.amount})),
        cancel: !readOnly && !view.outcome ? {type: "cancelResearch" as const, actor: focus.id, research: q.id} : null};
    });
  }
  if(focus?.revival&&(readOnly || focus.owner===owner)&&!focus.remembered){
    return focus.revival.queue.flatMap(q=>{const hero=view.fallenHeroes?.find(h=>h.id===q.hero);return hero?[{id:q.hero,icon:registry.get(hero.definition).icon,progress:q.progress/registry.get(focus.definition).behaviors.revival!.workTicks,name:`Revive ${registry.get(hero.definition).name}`,costs:[] as CostView[],cancel:!readOnly && !view.outcome?{type:"cancelRevival" as const,actor:focus.id,hero:q.hero}:null}]:[];});
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
      icon: d.icon,
      progress: null,
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
  if (d.supplyCost) result.push({name: "Supply", icon: registry.rules.supplyIcon, amount: d.supplyCost, kind: "supply"});
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
    (e) => registry.get(e.definition).hero || registry.get(e.definition).selectionClass === "army",
  );
  const candidates = army.length
    ? army
    : own.filter((e) => registry.get(e.definition).behaviors.work);
  return prioritizeSelection(candidates.map(e => e.id).sort((a,b) => a-b), entities, registry);
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
    if (override?.hidden) return;
    const reason = target ? prerequisiteReason(target, owner, view.entities, registry) : undefined;
    result.push({
      id,
      type,
      name: target?.name ?? meta.name,
      description: target?.description ?? meta.description,
      icon: target?.icon ?? meta.icon,
      costs: target ? costs(registry, target.id) : [],
      priority: override?.priority ?? meta.priority,
      placement: meta.placement,
      hotkey: override?.hotkey ?? meta.hotkey,
      category: override?.category === null ? undefined : override?.category ?? target?.category ?? meta.category,
      actors: actors.map((e) => e.id),
      targetDefinition,
      enabled: !view.outcome && !reason,
      reason,
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
    if(d.garrison&&view.entities.some(e=>e.unit?.garrison?.building===focus.id))
      add('unload',[focus],undefined,{type:'unload',actor:focus.id});
    if (d.upgrade) {
      const target = registry.get(d.upgrade.target);
      const reason = prerequisiteReason(target, owner, view.entities, registry) ??
        (d.upgrade.items.some(p => (view.goods?.find(g => g.item === p.item)?.available ?? 0) < p.amount) ? "Insufficient resources" : undefined);
      if (focus.upgrade) {
        const meta = registry.actions.actions.cancelUpgrade;
        result.push({id: "cancelUpgrade", type: "cancelUpgrade", name: meta.name, icon: meta.icon,
          description: `${target.name}: ${Math.floor(focus.upgrade.progress / d.upgrade.workTicks * 100)}% complete. Cancel to refund the full price.`,
          priority: meta.priority, hotkey: meta.hotkey, costs: [], actors: [focus.id], enabled: !view.outcome,
          immediate: {type: "cancelUpgrade", actor: focus.id}});
      } else {
        const meta = registry.actions.actions.upgrade;
        result.push({id: "upgrade", type: "upgrade", name: `Upgrade to ${target.name}`, icon: target.icon,
          description: `${target.description}\n${d.upgrade.workTicks*TICK_MS/1000}s. Unit training pauses during the upgrade.`,
          priority: meta.priority, hotkey: meta.hotkey, costs: d.upgrade.items.map(p => ({kind: "item", name: registry.get(p.item).name, icon: registry.get(p.item).icon, amount: p.amount})),
          actors: [focus.id], enabled: !view.outcome && !reason, reason, immediate: {type: "upgrade", actor: focus.id}});
      }
    }
    if (d.behaviors.research && focus.research) {
      for (const id of d.behaviors.research.outputs) {
        const r = registry.rules.research[id];
        const reason = view.research?.[owner]?.includes(id) ? "Already researched" :
          view.entities.some(e => e.owner === owner && e.research?.queue.some(q => q.id === id)) ? "Research already queued" :
          focus.research.queue.length >= d.behaviors.research.queueCapacity ? "Research queue is full" :
          prerequisiteReason(r, owner, view.entities, registry) ??
          (r.items.some(p => (view.goods?.find(g => g.item === p.item)?.available ?? 0) < p.amount) ? "Insufficient resources" : undefined);
        result.push({id: `research:${id}`, type: "research", name: r.name, description: `${r.description}\n${r.workTicks*TICK_MS/1000}s. Applies to existing and future units.`, icon: r.icon,
          costs: r.items.map(p => ({kind: "item", name: registry.get(p.item).name, icon: registry.get(p.item).icon, amount: p.amount})),
          priority: r.priority, actors: [focus.id], enabled: !view.outcome && !reason, reason,
          immediate: {type: "research", actor: focus.id, research: id}});
      }
    }
    if(d.behaviors.revival&&focus.revival){
      for(const hero of view.fallenHeroes??[]){
        const definition=registry.get(hero.definition),queued=view.entities.some(b=>b.revival?.queue.some(q=>q.hero===hero.id));
        const reason=hero.spellReturn?'Hero is returning through an ability':queued?'Hero is already being revived':focus.revival.queue.length>=d.behaviors.revival.queueCapacity?'Revival queue is full':view.supply?supplyAdmission(view.supply,definition.supplyCost!)??undefined:undefined;
        result.push({id:`revive:${hero.id}`,type:'revive',name:`Revive ${definition.name}`,description:`Return this level ${hero.stats?.level??1} hero with their items and learned abilities. ${d.behaviors.revival.workTicks*TICK_MS/1000}s.`,icon:definition.icon,costs:[{name:'Supply',icon:registry.rules.supplyIcon,amount:definition.supplyCost!,kind:'supply'}],priority:100,actors:[focus.id],enabled:!view.outcome&&!reason,reason,immediate:{type:'revive',actor:focus.id,hero:hero.id}});
      }
    }
    if (p && policy) {
      if (policy.mode === "queued")
        for (const output of policy.outputs) {
          const before = result.length;
          add("produce", [focus], output, {
            type: "produce",
            actor: focus.id,
            definition: output,
          });
          if (result.length === before || result.at(-1)!.reason) continue;
          if (p.queue.length >= policy.queueCapacity!) {
            const b = result.at(-1)!;
            b.enabled = false;
            b.reason = "Queue full";
          } else if (view.supply && supplyAdmission(view.supply, registry.get(output).supplyCost!)) {
            const b = result.at(-1)!; b.enabled = false;
            b.reason = supplyAdmission(view.supply, registry.get(output).supplyCost!)!;
          } else if (registry.get(output).creation!.items.some(cost =>
            (view.goods?.find(g => g.item === cost.item)?.available ?? 0) < cost.amount)) {
            const b = result.at(-1)!;
            b.enabled = false;
            b.reason = "Insufficient resources";
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
    add("hold",movers,undefined,{type:"hold",actors:movers.map(e=>e.id)});
    add("patrol",movers);
    add("follow",movers);
    const caster=controlled.filter(e=>e.definition===focus.definition).find(e=>e.abilities);
    if(caster?.abilities){
      const state=caster.abilities,policy=registry.get(caster.definition).behaviors.abilities!;
      for(const binding of policy.bindings){
        if(!binding.command||!binding.controls.includes('player'))continue;
        const spell=registry.abilityLibrary.abilities.find(a=>a.id===binding.ability)!,learned=state.ranks[binding.id]??0;
        const icon=binding.command.icon??registry.abilityLibrary.presentations.find(p=>p.id===spell.presentation)?.icon??registry.get(caster.definition).icon;
        if(binding.learning&&learned<spell.ranks.length){
          const level=caster.stats?.level??1,spent=policy.bindings.reduce((sum,b)=>sum+(state.ranks[b.id]??0)-b.initialRank,0),required=binding.learning.requiredLevels[learned];
          const learnReason=state.pending?'Casting':level<required?`Requires level ${required}`:spent>=level?'No skill points available':undefined;
          result.push({id:`learn:${binding.id}`,type:'learnAbility',ability:spell.id,binding:binding.id,name:`Learn ${spell.name}`,description:`${spell.description}\nRank ${learned+1}/${spell.ranks.length} · Requires level ${required}`,icon,costs:[],priority:60,category:'category.hero.skills',placement:'bottom-row',column:binding.command.column,hotkey:binding.command.hotkey,actors:[caster.id],enabled:!view.outcome&&!learnReason,reason:learnReason,immediate:{type:'learnAbility',actor:caster.id,ability:binding.id}});
        }
        if(!learned)continue;
        const rank=spell.ranks[learned-1],mana=value(spell.cast.cost.amount,rank),cooldown=Math.round(value(spell.cast.cooldown.ticks,rank)*(1000-(caster.stats?.cooldownReductionPermille??0))/1000);
        const remaining=Math.max(0,(state.cooldowns[spell.id]??0)-view.revision);
        const reason=spell.activation==='passive'?'Passive ability':state.pending?'Casting':remaining?`Ready in ${Math.ceil(remaining*TICK_MS/1000)}s`:state.mana<mana?'Not enough mana':undefined;
        const details=spell.onRelease.some(op=>op.op==='branch')?'Conditional effects':spell.onRelease.flatMap(e=>e.op==='branch'?[]:[e]).map(e=>`${value(e.amount,rank)} ${e.op}`).join(', ');
        const auto=spell.autocast&&(state.autocast?.[binding.id]??spell.autocast.enabledByDefault);
        result.push({...((spell.targeting.kind==='self'&&spell.activation!=='passive')?{immediate:{type:'castAbility' as const,actor:caster.id,binding:binding.id,target:{kind:'unit' as const,entity:caster.id}}}:{}),
          ...(spell.autocast?{autocast:!!auto,alternate:{type:'abilityAutocast' as const,actor:caster.id,binding:binding.id,enabled:!auto}}:{}),id:`cast:${binding.id}`,type:'castAbility',ability:spell.id,binding:binding.id,name:spell.name,icon,hotkey:binding.command.hotkey,priority:60,placement:'bottom-row',column:binding.command.column,
          description:`${spell.description}\n${details}${spell.targeting.kind==='point'?` · radius ${value(spell.targeting.radius!,rank)}`:''}${spell.cast.channel?` · ${value(spell.cast.channel.waves,rank)} waves, ${value(spell.cast.channel.intervalTicks,rank)*TICK_MS/1000}s apart`:''}\nRank ${learned}/${spell.ranks.length} · ${cooldown*TICK_MS/1000}s cooldown`,
          cooldown:{remainingTicks:remaining,totalTicks:cooldown},costs:[{kind:'mana',name:'Mana',icon,amount:mana}],actors:[caster.id],enabled:!view.outcome&&!reason,reason});
      }
    }
    const buildIds = new Set(
      units.filter(e=>e.definition===focus.definition).flatMap(
        (e) => registry.get(e.definition).behaviors.work?.builds ?? [],
      ),
    );
    for (const id of buildIds) {
      const workers = units.filter((e) =>
        registry.get(e.definition).behaviors.work?.builds.includes(id),
      );
      add("build", workers, id);
    }
  }
  return result.sort(
    (a, b) =>
      b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
