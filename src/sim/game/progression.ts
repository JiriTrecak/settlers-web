import type { GameContext } from "./context";
import { distance2 } from "./spatial";
import { precise } from "./motion";
import type { Entity, } from "./state";

export class Progression {
  constructor(private readonly c: GameContext) {}

  /** Called once by authoritative death resolution; the combat system supplies eligible opponents. */
  award(dead: Entity, eligible: (hero: Entity) => boolean) {
    const reward = this.c.def(dead).experienceYield ?? 0;
    if (!reward) return;
    const heroes = this.c.activeUnits().filter(e => e.progression && eligible(e) &&
      distance2(precise(e),precise(dead)) <= this.c.def(e).behaviors.progression!.experienceRadius ** 2)
      .sort((a,b) => a.id-b.id);
    for (const [i,hero] of heroes.entries()) {
      const before = this.c.stats(hero);
      const amount = Math.floor(reward/heroes.length) + (i < reward % heroes.length ? 1 : 0);
      const p = this.c.def(hero).behaviors.progression!;
      hero.progression!.experience = Math.min(p.levels[p.levels.length-1].experience,hero.progression!.experience+amount);
      const after = this.c.stats(hero);
      // Preserve damage already sustained, rather than healing completely on level-up.
      hero.hp! += after.maxHp-before.maxHp;
      if (hero.spellcasting) hero.spellcasting.mana += after.maxMana - before.maxMana;
      if (after.level > before.level) this.c.event(hero.owner,`${this.c.def(hero).name} reached level ${after.level}`);
    }
  }
}
