import type { GameContext } from './context';
import type { Owner } from '../../content/schema';
import { heroRoster } from '../../content/heroRoster';
import { distance2 } from './spatial';
import { precise } from './motion';
import type { Entity } from './state';

export class Progression {
  constructor(private readonly c: GameContext) {}

  /** One reward pool per authoritative combat death. The caller verifies hostility
   * and supplies the lethal hit's captured owner, not whoever stands near a corpse. */
  award(dead: Entity, creditedOwner: Owner, allied: (hero: Entity) => boolean) {
    if (creditedOwner === 'none') return;
    const definition = this.c.def(dead), policy = this.c.registry.rules.experience;
    if (definition.kind !== 'unit') return;
    const table = definition.hero ? policy.heroRewards : policy.unitRewards;
    const level = this.c.stats(dead).level;
    const base = definition.experienceYield ?? table[Math.min(level, table.length) - 1];
    const reward = Math.floor(base * (dead.summoned ? policy.summonMultiplierPermille : 1000) / 1000);
    if (!reward) return;
    const neutral = dead.owner === 'none';
    const ceiling = (hero: Entity) => {
      const levels = this.c.def(hero).behaviors.progression!.levels;
      return levels[Math.min(levels.length, this.c.map.mission?.heroLevelCap ?? levels.length,
        neutral ? policy.neutralLevelCap : levels.length) - 1].experience;
    };
    const candidates = this.c.activeUnits().filter(e => e.progression && !e.summoned && allied(e) &&
      e.progression.experience < ceiling(e));
    const nearby = candidates.filter(e =>
      distance2(precise(e), precise(dead)) <= this.c.def(e).behaviors.progression!.experienceRadius ** 2);
    const heroes = (nearby.length ? nearby : policy.globalFallback ? candidates.filter(e => e.owner === creditedOwner) : [])
      .sort((a, b) => a.id - b.id);
    for (const [i, hero] of heroes.entries()) {
      const before = this.c.stats(hero);
      // Assign indivisible remainder points by stable entity ID, before recipient
      // multipliers. Rounding and capped overflow never mint a second reward pool.
      const share = Math.floor(reward / heroes.length) + (i < reward % heroes.length ? 1 : 0);
      const roster = heroRoster(this.c.populationCandidates(), hero.owner, this.c.registry);
      const bonus = roster.used === 1 ? policy.soloHeroTierBonusPermille[Math.min(roster.capacity, policy.soloHeroTierBonusPermille.length) - 1] ?? 0 : 0;
      const multiplier = neutral ? policy.neutralMultipliersPermille[before.level - 1] ?? 0 : 1000;
      const amount = Math.floor(share * multiplier * (1000 + bonus) / 1_000_000);
      hero.progression!.experience = Math.min(ceiling(hero), hero.progression!.experience + amount);
      const after = this.c.stats(hero);
      // Preserve damage and mana already spent; leveling is not a full refill.
      hero.hp! += after.maxHp - before.maxHp;
      if (hero.abilities) hero.abilities.mana += after.maxMana - before.maxMana;
      if (after.level > before.level) this.c.event(hero.owner, `${this.c.def(hero).name} reached level ${after.level}`);
    }
  }
}
