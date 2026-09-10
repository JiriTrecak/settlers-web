import { z } from "zod";
import type { Definition } from "../../content/schema";
import type { ContentRegistry } from "../../content/registry";
import type { Entity } from "./state";

export const resolvedStatsSchema = z.object({
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
export function entityStats(d: Definition, e: Pick<Entity,"progression"|"equipment"|"effects">, registry?: ContentRegistry) {
  const levels = d.behaviors.progression?.levels;
  const rank = levels ? levels.filter(l => l.experience <= (e.progression?.experience ?? 0)).length - 1 : 0;
  const level = levels?.[Math.max(0,rank)];
  const result = {
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
  const bonus = (e.effects ?? []).reduce((n,b) => n +
    (registry?.rules.spells[b.ability]?.ranks[b.rank-1].damageBonusPermille ?? 0), 0);
  // Retain fractional attack bonuses until the single damage-application rounding step.
  result.damage *= 1 + bonus / 1000;
  return result;
}
