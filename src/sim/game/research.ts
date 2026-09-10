import { prerequisiteReason } from "../../content/prerequisites";
import type { GameContext } from "./context";
import type { Economy } from "./economy";
import { add, type Entity } from "./state";

/** Colony-wide purchases; buildings own only unfinished paid tasks. */
export class Research {
  constructor(private readonly c: GameContext, private readonly economy: Economy) {}
  enqueue(building: Entity, id: string): string | null {
    const policy = this.c.def(building).behaviors.research, recipe = this.c.registry.rules.research[id];
    if (!policy?.outputs.includes(id) || !recipe || !building.research || building.construction)
      return "Select a completed research building";
    if (this.c.state.research[building.owner]?.includes(id)) return "Already researched";
    if (this.c.live().some(e => e.owner === building.owner && e.research?.queue.some(q => q.id === id)))
      return "Research already queued";
    if (building.research.queue.length >= policy.queueCapacity) return "Research queue is full";
    const reason = prerequisiteReason(recipe, building.owner, this.c.state.entities, this.c.registry);
    if (reason) return reason;
    const payment = this.economy.reserveCost(building.owner, Object.fromEntries(recipe.items.map(p => [p.item, p.amount])));
    if (!payment) return "Insufficient resources";
    for (const p of payment) add(p.source.inventory, p.item, -p.amount);
    building.research.queue.push({id, progress: 0});
    return null;
  }
  cancel(building: Entity, id: string): string | null {
    const queue = building.research?.queue, index = queue?.findIndex(q => q.id === id) ?? -1;
    if (!queue || index < 0) return "Research is not queued here";
    const account = this.c.get(this.c.state.objectives[building.owner]);
    if (!account || account.hp === 0) return "No living colony account";
    for (const p of this.c.registry.rules.research[id].items) add(account.inventory, p.item, p.amount);
    queue.splice(index, 1);
    return null;
  }
  tick() {
    for (const building of this.c.live()) {
      const entry = building.research?.queue[0];
      if (!entry || building.construction || building.upgrade || !this.c.ready(building)) continue;
      if (++entry.progress < this.c.registry.rules.research[entry.id].workTicks) continue;
      for (const p of this.c.registry.rules.research[entry.id].items)
        this.c.event(building.owner, "Research completed", "consumed", p.item, p.amount);
      const units = this.c.state.entities.filter(e => e.owner === building.owner && e.unit);
      const oldHp = units.map(e => this.c.stats(e).maxHp);
      (this.c.state.research[building.owner] ??= []).push(entry.id);
      this.c.state.research[building.owner].sort();
      units.forEach((e, i) => { if (e.hp! > 0) e.hp! += this.c.stats(e).maxHp - oldHp[i]; });
      building.research!.queue.shift();
      this.c.event(building.owner, `${this.c.registry.rules.research[entry.id].name} researched`);
    }
  }
}
