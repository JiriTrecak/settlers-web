import type { ContentRegistry } from "../content/registry";
import type { Action } from "../shared/types/types";
import type { SettlementView } from "../sim/game/observation";

export type CommandFeedback = {kind: "move" | "attack" | "gather"; point: {x: number; y: number}; radius: number};
export const commandFeedbackStyles = {
  move: {color: 0xffffff, pulses: 1},
  attack: {color: 0xff4141, pulses: 2},
  gather: {color: 0x67ff77, pulses: 2},
} as const;

/** Use the click destination or an observed target, never hidden simulation coordinates. */
export function commandFeedback(action: Action, view: SettlementView, registry: ContentRegistry): CommandFeedback | null {
  if(action.type==="patrol")return {kind:"move",point:action.destination,radius:.85};
  if (action.type === "move") return {kind: action.attackMove ? "attack" : "move", point: action.destination, radius: .85};
  if (action.type !== "attack" && action.type !== "gather" && action.type !== "pickup" && action.type !== "follow") return null;
  const target = view.entities.find(e => e.id === action.target);
  if (!target || target.remembered) return null;
  const footprint = registry.get(target.definition).footprint;
  return {
    kind: (action.type === "pickup" || action.type === "follow") ? "move" : action.type,
    point: {x: target.x, y: target.y},
    radius: footprint ? Math.hypot(footprint.width, footprint.depth) / 2 + .25 : action.type === "gather" ? 1.25 : .85,
  };
}
