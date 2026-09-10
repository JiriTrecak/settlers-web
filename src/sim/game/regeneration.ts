import type { GameContext } from "./context";

// Each fixed tick adds milli-points/second; 40,000 accumulated units become one point.
const POINT = 40_000;
export class Regeneration {
  constructor(private readonly c: GameContext) {}
  tick() {
    for (const e of this.c.activeUnits()) {
      const carry = e.regeneration!;
      const stats = this.c.stats(e);
      if (e.hp !== null && e.hp < stats.maxHp) {
        carry.health += Math.round(stats.healthRegenPerSecond * 1000);
        e.hp = Math.min(stats.maxHp, e.hp + Math.floor(carry.health / POINT));
        carry.health %= POINT;
      }
      if (e.hp === stats.maxHp) carry.health = 0;
      if (e.spellcasting && e.spellcasting.mana < stats.maxMana) {
        carry.mana += Math.round(stats.manaRegenPerSecond * 1000);
        e.spellcasting.mana = Math.min(stats.maxMana, e.spellcasting.mana + Math.floor(carry.mana / POINT));
        carry.mana %= POINT;
      }
      if (!e.spellcasting || e.spellcasting.mana === stats.maxMana) carry.mana = 0;
    }
  }
}
