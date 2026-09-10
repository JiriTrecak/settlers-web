import type { ContentRegistry } from "../content/registry";
import type { EntityView, SettlementView } from "../sim/game/observation";

/** Pending unit intentions, with labels/art from the same content as the command card. */
export function unitOrderCard(focus: EntityView | undefined, view: SettlementView, registry: ContentRegistry) {
  return (focus?.control?.orderQueue ?? []).map((order, index) => {
    const action = order.type === "construct" ? "build" : order.type === "move" && order.attackMove ? "attack" : order.type;
    const target = "target" in order ? view.entities.find(e => e.id === order.target) : undefined;
    const definition = target ? registry.get(target.definition) : undefined;
    const meta = action === "gather" || action === "pickup"
      ? {name: action === "gather" ? "Gather" : "Pick up", icon: definition?.icon ?? registry.actions.actions.move.icon}
      : registry.actions.actions[action];
    return {
      index: index + 1,
      name: `${meta.name}${definition ? `: ${definition.name}` : ""}`,
      icon: order.type === "construct" && definition ? definition.icon : meta.icon,
      description: `Queued order ${index + 1}. ${"destination" in order ? `Destination ${order.destination.x}, ${order.destination.y}. ` : ""}Runs after the current task. A normal order or Stop clears pending orders.`,
    };
  });
}
