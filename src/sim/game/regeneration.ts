import type { GameContext } from "./context";

// Each fixed tick adds milli-points/second; 40,000 accumulated units become one point.
const POINT = 40_000;
export class Regeneration {
  constructor(private readonly c: GameContext) {}
  tick() {
    for (const e of this.c.liveUnits()) {
      const carry = e.regeneration!;
      this.c.reconcileFlight(e);this.c.reconcileWeapon(e);
      const stats = this.c.stats(e);
      // Clamp after all auras have been rebuilt, never in the temporary gap between sources.
      if(e.hp!==null)e.hp=Math.min(e.hp,stats.maxHp);
      if(!this.c.ready(e)||e.unit!.contained||e.unit!.release)continue;
      if (e.hp !== null && e.hp < stats.maxHp) {
        carry.health += Math.round(stats.healthRegenPerSecond * 1000);
        e.hp = Math.min(stats.maxHp, e.hp + Math.floor(carry.health / POINT));
        carry.health %= POINT;
      }
      if (e.hp === stats.maxHp) carry.health = 0;
    }
  }
}
