import type { GameContext } from "./context";
import type { Economy } from "./economy";
import { isStunned } from "./effects";
import { MAX_QUEUED_ORDERS, type Entity, type UnitOrder } from "./state";

/** Per-unit intentions, separate from transport packets and building production. */
export class UnitOrders {
  constructor(private readonly c: GameContext, private readonly economy: Economy) {}

  busy(e: Entity): boolean {
    const u = e.unit!;
    return !!(e.spellcasting?.pending || u.order || u.job || u.cargo || u.employment || u.pendingMove || u.orderQueue.length);
  }
  canIssue(e: Entity, append = false): boolean {
    return !append || e.unit!.orderQueue.length < MAX_QUEUED_ORDERS;
  }
  issue(e: Entity, order: UnitOrder, append = false): boolean {
    if (!this.canIssue(e, append)) return false;
    const u = e.unit!;
    if (append && this.busy(e)) {
      u.orderQueue.push(order);
      return true;
    }
    this.economy.interrupt(e, order.type === "move" ? order.destination : undefined);
    u.order = order;
    u.target = order.type === "attack" && !u.cargo ? order.target : null;
    if (order.type !== "move") u.pendingMove = null;
    u.retryAt = this.c.state.tick;
    return true;
  }
  advance(activate: (e: Entity, order: UnitOrder) => boolean) {
    for (const e of this.c.activeUnits()) {
      const u = e.unit!;
      if (u.order || u.job || u.cargo || u.pendingMove || e.spellcasting?.pending || isStunned(e, this.c.registry)) continue;
      while (u.orderQueue.length) {
        const order = u.orderQueue.shift()!, remaining = u.orderQueue;
        // Normal activation replaces orders. Keep the already-authorized tail.
        u.orderQueue = [];
        const accepted = activate(e, order);
        u.orderQueue = remaining;
        if (accepted) break;
      }
    }
  }
}
