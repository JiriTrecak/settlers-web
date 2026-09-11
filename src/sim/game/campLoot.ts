import {dropPosition} from './dropPosition';
import type { Camp } from "../../content/schema";
import type { GameContext } from "./context";
import { rollLoot } from "./loot";
import { alive, type Entity } from "./state";

/** A camp pays once, when its final defender dies. Rolls belong to simulation state. */
export class CampLoot {
  constructor(private readonly c: GameContext, private readonly camps: readonly Camp[]) {}

  onDeath(dead: Entity): Entity[] {
    const camp = this.camps.find(c => c.id === dead.unit?.camp);
    if (!camp || this.c.state.clearedCamps.includes(camp.id)) return [];
    if (this.c.state.entities.some(e => e.unit?.camp === camp.id && alive(e))) return [];
    this.c.state.clearedCamps.push(camp.id);
    const drops = camp.fixedDrops ?? (camp.lootPool
      ? rollLoot(this.c.state, this.c.registry.rules.lootPools[camp.lootPool]) : []);
    return drops.map(definition => this.c.create({
      id: "", definition, owner: "none", rotation: 0,
      position: dropPosition(this.c, dead, dead.id), initialState: {quantity: 1},
    }));
  }
}
