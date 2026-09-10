import type { GameContext } from './context';
import type { Entity } from './state';
import { alive } from './state';
import { isStunned } from './effects';
import { itemFlag } from './itemModifiers';
import { fixed } from './motion';

/** Charge changes locomotion budget, never the pathfinder or collision rules. */
export function maintainCharge(c: GameContext, e: Entity) {
  const u = e.unit!, charge = u.charge;
  if (!charge || charge.target === null) return;
  const target = c.get(charge.target);
  if (charge.expires <= c.state.tick || !target || !alive(target) ||
      charge.target !== u.target || u.job || u.contained || u.returning ||
      (u.order?.type === 'move' && !u.order.attackMove) ||
      (u.order?.type === 'attack' && u.order.target !== charge.target) ||
      isStunned(e, c.registry) || e.spellcasting?.pending ||
      (itemFlag(e, c.registry, 'rooted') && !itemFlag(e, c.registry, 'controlImmune'))) {
    charge.target = null;
  }
}

export function startCharge(c: GameContext, e: Entity, target: Entity) {
  const u = e.unit!, policy = c.def(e).behaviors.combat?.charge;
  if (!policy || !target.unit || u.charge?.target != null ||
      (u.charge?.readyTick ?? 0) > c.state.tick || !u.route.length ||
      (itemFlag(e, c.registry, 'rooted') && !itemFlag(e, c.registry, 'controlImmune'))) return;
  const distance = c.spatial.range(e, target);
  if (distance < policy.minRange ** 2 || distance > policy.maxRange ** 2) return;
  // Do not spend the cooldown while following a detour behind a wall.
  if (!c.spatial.clearSegment(u.position ?? fixed(e), target.unit.position ?? fixed(target))) return;
  let cooldown = policy.cooldownTicks;
  for (const id of c.state.research[e.owner] ?? []) {
    for (const effect of c.registry.rules.research[id]?.effects ?? []) {
      if (effect.units.includes(e.definition) && effect.chargeCooldownPermille)
        cooldown = Math.max(1, Math.round(cooldown * effect.chargeCooldownPermille / 1000));
    }
  }
  u.charge = {target: target.id, expires: c.state.tick + policy.durationTicks, readyTick: c.state.tick + cooldown};
}

export function chargeDamage(c: GameContext, e: Entity, target: Entity) {
  const charge = e.unit!.charge, base = c.stats(e).damage;
  if (charge?.target !== target.id || charge.expires <= c.state.tick) return base;
  charge.target = null;
  return Math.round(base * (c.def(e).behaviors.combat?.charge?.damagePermille ?? 1000) / 1000);
}
