import { prerequisiteReason } from "../../content/prerequisites";
import type { GameContext } from "./context";
import type { Economy } from "./economy";
import { add, type Entity } from "./state";

/** Paid, in-place transforms. The original entity stays authoritative until completion. */
export class BuildingUpgrades {
  constructor(private readonly c: GameContext, private readonly economy: Economy) {}
  enqueue(building: Entity): string | null {
    const recipe = this.c.def(building).upgrade;
    if (!recipe || building.construction) return "Select a completed upgradeable building";
    if (building.upgrade) return "Upgrade already in progress";
    const reason = prerequisiteReason(this.c.registry.get(recipe.target), building.owner, this.c.state.entities, this.c.registry);
    if (reason) return reason;
    const bill = Object.fromEntries(recipe.items.map(p => [p.item, p.amount]));
    const payment = this.economy.reserveCost(building.owner, bill);
    if (!payment) return "Insufficient resources";
    for (const p of payment) add(p.source.inventory, p.item, -p.amount);
    building.upgrade = {target: recipe.target, progress: 0};
    return null;
  }
  cancel(building: Entity): string | null {
    if (!building.upgrade) return "No upgrade in progress";
    const account = this.c.get(this.c.state.objectives[building.owner]);
    if (!account || account.hp === 0) return "No living colony account";
    for (const p of this.c.def(building).upgrade!.items) add(account.inventory, p.item, p.amount);
    delete building.upgrade;
    return null;
  }
  tick() {
    for (const building of this.c.live()) {
      if (!building.upgrade || !this.c.ready(building)) continue;
      const old = this.c.def(building), task = building.upgrade;
      if (++task.progress < old.upgrade!.workTicks) continue;
      const target = this.c.registry.get(task.target);
      for (const p of old.upgrade!.items)
        this.c.event(building.owner, "Building upgrade completed", "consumed", p.item, p.amount);
      building.hp = building.hp! + target.body!.maxHp - old.body!.maxHp;
      building.definition = target.id;
      delete building.upgrade;
      this.c.event(building.owner, `${target.name} completed`);
    }
  }
}
