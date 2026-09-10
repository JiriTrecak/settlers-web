import type { ContentRegistry } from "../../content/registry";
import type { Entity } from "./state";

type Rules = ContentRegistry["rules"];
export type DamageDefense = { armor: number; armorType: string; reductionPermille?: number };

/** Armor is validated nonnegative in content. Negative armor needs an explicit new rule. */
export function armorMultiplier(rules: Rules, armor: number): number {
  if (armor < 0) throw new Error("Negative armor is unsupported");
  return 1 / (1 + rules.armorCoefficient * armor);
}
export function guardReduction(rules: Rules, effects: Entity["effects"]): number {
  return Math.max(0, ...(effects ?? []).map(b => rules.spells[b.ability].ranks[b.rank-1].reductionPermille));
}
export function resolveDamage(rules: Rules, target: DamageDefense, raw: number, type: string): number {
  const policy = rules.damageTypes[type];
  const matchup = rules.damageMultipliers[type]?.[target.armorType];
  if (!policy || matchup === undefined) throw new Error(`Unknown damage matchup ${type}/${target.armorType}`);
  if (raw <= 0 || matchup === 0 || target.reductionPermille === 1000) return 0;
  const multiplier = policy.appliesArmor ? armorMultiplier(rules, target.armor) : 1;
  return Math.max(1, Math.round(raw * matchup / 1000 * multiplier * (1 - (target.reductionPermille ?? 0) / 1000)));
}
export function areaDamageScale(budget: number | undefined, eligibleTargets: number): number {
  return budget && eligibleTargets > budget ? budget / eligibleTargets : 1;
}
export function stunDuration(rules: Rules, ticks: number, isUnit: boolean, isHero: boolean): number {
  if (!isUnit) return 0;
  return isHero ? Math.round(ticks * rules.heroStunDurationPermille / 1000) : ticks;
}
