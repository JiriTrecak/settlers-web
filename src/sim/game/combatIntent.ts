import type { Entity } from './state';

type Unit = NonNullable<Entity['unit']>;

/** A route is a disposable plan, never the unit's physical position. */
export function discardNavigation(u: Unit) {
  u.route = [];
  u.goal = null;
  u.segment = null;
  delete u.detour;
}

/** Release engagement state without touching another system's movement plan. */
export function releaseCombat(u: Unit) {
  u.target = null;
  delete u.pursuit;
  delete u.attack;
  // Keep the spent charge cooldown; only its active target is cancelled.
  if (u.charge) u.charge.target = null;
}

/** Suspend the engagement, retaining orders so temporary disarm can recover.
 * Work, plain movement, follow and camp return own their own navigation. A stale
 * combat reference must never cancel those plans when its target disappears.
 */
export function suspendCombat(u: Unit, tick: number) {
  const engaged = u.target !== null || !!u.pursuit || !!u.attack ||
    u.charge?.target != null || u.order?.type === 'attack';
  const order = u.order;
  const ownsNavigation = !u.job && !u.returning && (!order ||
    order.type === 'attack' || order.type === 'hold' || order.type === 'patrol' ||
    (order.type === 'move' && order.attackMove));
  if (engaged && ownsNavigation) {
    discardNavigation(u);
    u.retryAt = tick;
  }
  releaseCombat(u);
}

/** Complete only an explicit attack; keep queued orders and attack-move/patrol. */
export function finishCombat(u: Unit, tick: number) {
  suspendCombat(u, tick);
  if (u.order?.type === 'attack') u.order = null;
}
