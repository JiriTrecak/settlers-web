import type {Definition} from '../../content/schema';
/** Capture a speed-scaled cycle at windup start; later buffs never retime its impact. */
export function attackTiming(combat:NonNullable<Definition['behaviors']['combat']>,cycleTicks:number){
  return {
    windupTicks:Math.max(1,Math.round(combat.attack.windupTicks*cycleTicks/combat.cooldownTicks)),
    recoveryTicks:Math.max(0,Math.round(combat.attack.recoveryTicks*cycleTicks/combat.cooldownTicks)),
  };
}
