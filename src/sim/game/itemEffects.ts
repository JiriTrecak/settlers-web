import type { Owner } from "../../content/schema";
import type { ItemRuntime } from "../../content/items";
import type { GameContext } from "./context";
import type { DamageHit } from "./combat";
import { alive, type Entity } from "./state";
import { precise } from "./motion";
import { distance2 } from "./spatial";
import { itemFlag } from "./itemModifiers";
import { isStunned } from "./effects";

/** Deterministic interpreter for authored hero items; runtime travels with each item. */
export class ItemEffects {
  constructor(private readonly c: GameContext, private readonly teams: ReadonlyMap<Owner, number> = new Map()) {}
  private allies(a: Entity, b: Entity): boolean {
    return a.owner !== "none" && b.owner !== "none" && (a.owner === b.owner || (this.teams.has(a.owner) && this.teams.get(a.owner) === this.teams.get(b.owner)));
  }
  private targets(source: Entity, relation: "self" | "allies" | "enemies", radius: number): Entity[] {
    return this.c.activeUnits().filter(target => relation === "self" ? target.id === source.id :
      distance2(precise(source), precise(target)) <= radius ** 2 && (relation === "allies" ? this.allies(source, target) : target.id !== source.id && !this.allies(source, target) && (source.owner !== "none" || target.owner !== "none")));
  }
  runtime(hero: Entity, slot: number): ItemRuntime {
    hero.equipmentState ??= hero.equipment!.map(() => null);
    const effect = this.c.registry.get(hero.equipment![slot]!).itemEffect!;
    return hero.equipmentState[slot] ??= {readyTick: 0, hits: 0, ...((effect.active?.charges ?? effect.rescue?.charges) !== undefined ? {charges: effect.active?.charges ?? effect.rescue?.charges} : {})};
  }
  tick(): void {
    const sources = this.c.activeUnits();
    for (const e of this.c.state.entities) {
      if (e.itemStatuses) {
        e.itemStatuses = e.itemStatuses.filter(s => s.kind !== "aura" && s.expires > this.c.state.tick && alive(e));
        if (!e.itemStatuses.length) delete e.itemStatuses;
      }
    }
    for (const source of sources) for (const id of new Set(source.equipment ?? [])) {
      const aura = id && this.c.registry.get(id).itemEffect?.aura;
      if (!id || !aura) continue;
      for (const target of this.targets(source, aura.target, aura.radius)) {
        target.itemStatuses ??= [];
        if (!target.itemStatuses.some(s => s.item === id && s.kind === "aura")) target.itemStatuses.push({item: id, source: source.id, kind: "aura", expires: this.c.state.tick + 1});
      }
    }
    for (const e of sources) {
      const stats = this.c.stats(e);
      e.hp = Math.min(e.hp!, stats.maxHp);
      if (e.spellcasting) e.spellcasting.mana = Math.min(e.spellcasting.mana, stats.maxMana);
    }
  }
  use(hero: Entity, slot: number): string | null {
    const id = hero.equipment?.[slot], effect = id && this.c.registry.get(id).itemEffect;
    if (!id || !effect || (!effect.active && effect.type !== "consumable")) return "This item cannot be used";
    if (!alive(hero) || isStunned(hero, this.c.registry) || hero.spellcasting?.pending) return "Cannot use items while busy or stunned";
    const active = effect.active;
    const runtime = this.runtime(hero, slot);
    if (runtime.readyTick > this.c.state.tick) return "Item is cooling down";
    if (runtime.charges === 0) return "No charges remaining";
    const targets = this.targets(hero, active?.target ?? "self", active?.radius ?? 0);
    const heal = active?.heal ?? (effect.type === "consumable" ? effect.heal : 0), mana = active?.mana ?? 0;
    if (!targets.length) return "No targets in range";
    if (!active?.status && !active?.damage && !active?.reduceAbilityCooldownTicks && !targets.some(t =>
      ((heal || active?.healMaxPermille) && t.hp! < this.c.stats(t).maxHp) || (mana && t.spellcasting && t.spellcasting.mana < this.c.stats(t).maxMana))) return "Health and mana are already full";
    for (const target of targets) {
      const stats = this.c.stats(target);
      target.hp = Math.min(stats.maxHp, target.hp! + heal + Math.round(stats.maxHp * (active?.healMaxPermille ?? 0) / 1000));
      if (target.spellcasting) {
        target.spellcasting.mana = Math.min(stats.maxMana, target.spellcasting.mana + mana);
        if (active?.reduceAbilityCooldownTicks) for (const ability of Object.keys(target.spellcasting.cooldowns)) target.spellcasting.cooldowns[ability] = Math.max(this.c.state.tick, target.spellcasting.cooldowns[ability] - active.reduceAbilityCooldownTicks);
      }
      if (active?.status) {
        target.itemStatuses = (target.itemStatuses ?? []).filter(s => s.item !== id || s.kind !== "active");
        target.itemStatuses.push({item: id, source: hero.id, kind: "active", expires: this.c.state.tick + active.status.durationTicks, ...(active.status.shield ? {shield: active.status.shield} : {})});
      }
      // Damage is queued in saved entity state and resolved with regular combat, never kills outside the death pipeline.
      if (active?.damage) {
        hero.itemHits ??= [];
        hero.itemHits.push({item: id, source: hero.id, target: target.id, damage: active.damage, damageType: active.damageType!});
      }
    }
    runtime.readyTick = this.c.state.tick + (active?.cooldownTicks ?? 0);
    if (runtime.charges !== undefined) runtime.charges--;
    if (runtime.charges === 0 || (effect.type === "consumable" && runtime.charges === undefined)) this.consume(hero, slot);
    return null;
  }
  drainHits(): DamageHit[] {
    const hits: DamageHit[] = [];
    for (const e of this.c.state.entities) { if (!e.itemHits) continue; if (alive(e)) hits.push(...e.itemHits); delete e.itemHits; }
    return hits;
  }
  onHit(source: Entity, target: Entity, damage: number, damageType: string): DamageHit[] {
    const hits: DamageHit[] = [];
    if (damage <= 0 || this.allies(source, target)) return hits;
    const stats = this.c.stats(source);
    source.hp = Math.min(stats.maxHp, source.hp! + Math.floor(Math.min(target.hp!, damage) * stats.lifestealPermille / 1000));
    const seen = new Set<string>();
    for (let slot = 0; slot < (source.equipment?.length ?? 0); slot++) {
      const id = source.equipment![slot];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const proc = this.c.registry.get(id).itemEffect?.onHit;
      if (!proc) continue;
      const runtime = this.runtime(source, slot);
      runtime.hits = (runtime.hits + 1) % proc.every;
      if (runtime.hits) continue;
      const candidates = this.targets(source, "enemies", 32).filter(t => distance2(precise(t), precise(target)) <= proc.radius ** 2).sort((a,b) => distance2(precise(a),precise(target))-distance2(precise(b),precise(target)) || a.id-b.id).slice(0, proc.targets);
      for (const t of candidates) hits.push({source: source.id, target: t.id, damage: (proc.damage ?? 0) + stats.damage * (proc.attackDamagePermille ?? 0) / 1000, damageType: proc.damageType || damageType});
    }
    return hits;
  }
  absorb(target: Entity, damage: number): number {
    if (itemFlag(target, this.c.registry, "invulnerable")) return 0;
    for (const status of target.itemStatuses ?? []) if (status.shield) {
      const absorbed = Math.min(status.shield, damage); status.shield -= absorbed; damage -= absorbed;
    }
    return damage;
  }
  rescue(target: Entity): boolean {
    for (let slot = 0; slot < (target.equipment?.length ?? 0); slot++) {
      const id = target.equipment![slot], rescue = id && this.c.registry.get(id).itemEffect?.rescue;
      if (!id || !rescue) continue;
      const runtime = this.runtime(target, slot);
      if (!runtime.charges) continue;
      runtime.charges--;
      target.itemStatuses = [...(target.itemStatuses ?? []), {item:id, source:target.id, kind:"rescue", expires:this.c.state.tick+rescue.invulnerableTicks}];
      if (!runtime.charges) this.consume(target, slot);
      target.hp = Math.max(1, Math.round(this.c.stats(target).maxHp * rescue.healMaxPermille / 1000));
      return true;
    }
    return false;
  }
  private consume(hero: Entity, slot: number): void { hero.equipment![slot] = null; if (hero.equipmentState) hero.equipmentState[slot] = null; }
}
