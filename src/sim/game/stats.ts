import { itemModifiers } from "./itemModifiers";
import { z } from "zod";
import type { Definition } from "../../content/schema";
import type { ContentRegistry } from "../../content/registry";
import type { Entity } from "./state";

export const resolvedStatsSchema = z.object({
  moveSpeedPermille: z.number().default(1000),
  cooldownReductionPermille: z.number().default(0),
  lifestealPermille: z.number().default(0),
  level: z.number().int().positive(),
  maxHp: z.number().int().nonnegative(),
  damage: z.number().nonnegative(),
  armor: z.number().int().nonnegative(),
  cooldownTicks: z.number().int().positive(),
  maxMana: z.number().int().nonnegative(),
  healthRegenPerSecond: z.number().nonnegative(),
  manaRegenPerSecond: z.number().nonnegative(),
}).strict();

/** One resolved stat path for simulation, observation, HUD, AI and the encyclopedia. */
export function entityStats(d: Definition, e: Pick<Entity,"progression"|"equipment"|"effects"|"itemStatuses"|"slows">, registry?: ContentRegistry, research: readonly string[] = []) {
  const levels = d.behaviors.progression?.levels;
  const rank = levels ? levels.filter(l => l.experience <= (e.progression?.experience ?? 0)).length - 1 : 0;
  const level = levels?.[Math.max(0,rank)];
  const result = {
    moveSpeedPermille: 1000, cooldownReductionPermille: 0, lifestealPermille: 0,
    level: levels ? rank + 1 : d.level ?? 1,
    maxHp: level?.maxHp ?? d.body?.maxHp ?? 0,
    damage: level?.damage ?? d.behaviors.combat?.damage ?? 0,
    armor: level?.armor ?? d.body?.armor ?? 0,
    cooldownTicks: level?.cooldownTicks ?? d.behaviors.combat?.cooldownTicks ?? 1,
    maxMana: level?.maxMana ?? d.behaviors.spellcasting?.maxMana ?? 0,
    healthRegenPerSecond: level?.healthRegenPerSecond ?? 0,
    manaRegenPerSecond: level?.manaRegenPerSecond ?? d.behaviors.spellcasting?.manaRegenPerSecond ?? 0,
  };
  for (const id of e.equipment ?? []) {
    const effect = id && registry?.get(id).itemEffect;
    if (effect && effect.type === "equipment") {
      result.maxHp += effect.maxHp;
      result.damage += effect.damage;
      result.armor += effect.armor;
    }
  }
  let attackSpeed = 1000, damageBonus = 0;
  for (const id of research) {
    for (const effect of registry?.rules.research[id]?.effects ?? []) {
      if (!effect.units.includes(d.id)) continue;
      result.maxHp += effect.maxHp ?? 0;
      result.armor += effect.armor ?? 0;
      damageBonus += effect.damagePermille ?? 0;
    }
  }
  for (const m of itemModifiers(e, registry)) {
    result.maxHp += m.maxHp ?? 0; result.maxMana += m.maxMana ?? 0;
    result.damage += m.damage ?? 0; result.armor += m.armor ?? 0;
    result.healthRegenPerSecond += m.healthRegenPerSecond ?? 0;
    result.manaRegenPerSecond += m.manaRegenPerSecond ?? 0;
    result.moveSpeedPermille += m.moveSpeedPermille ?? 0;
    result.cooldownReductionPermille += m.cooldownReductionPermille ?? 0;
    result.lifestealPermille += m.lifestealPermille ?? 0;
    attackSpeed += m.attackSpeedPermille ?? 0; damageBonus += m.damagePermille ?? 0;
  }
  const slow = Math.max(0, ...(e.slows ?? []).map(s => s.permille));
  result.moveSpeedPermille = Math.round(result.moveSpeedPermille * (1000 - slow) / 1000);
  result.moveSpeedPermille = Math.max(200, Math.min(1800, result.moveSpeedPermille));
  result.cooldownReductionPermille = Math.min(400, result.cooldownReductionPermille);
  result.lifestealPermille = Math.min(400, result.lifestealPermille);
  result.cooldownTicks = Math.max(1, Math.round(result.cooldownTicks * 1000 / Math.max(200, attackSpeed)));
  result.damage *= 1 + damageBonus / 1000;
  const bonus = (e.effects ?? []).reduce((n,b) => n +
    (registry?.rules.spells[b.ability]?.ranks[b.rank-1].damageBonusPermille ?? 0), 0);
  // Retain fractional attack bonuses until the single damage-application rounding step.
  result.damage *= 1 + bonus / 1000;
  return result;
}
