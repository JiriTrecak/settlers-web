import type { World, ViewSnapshot } from "../../sim/world/world";
import type { FogView } from "../../sim/game/observation";

/** Presentation only. Never pass this view to the command adapter or an AI controller. */
export class PresentationView {
  private fullFog: FogView | undefined;
  project(world: World, visionPlayer: number, reveal: boolean): ViewSnapshot {
    if (!reveal) return world.view(visionPlayer);
    const view = world.view();
    if (!view.settlement) return view;
    if (this.fullFog?.cells.length !== view.size * view.size)
      this.fullFog = {
        cells: new Uint8Array(view.size * view.size).fill(2),
        revision: -2,
        owner: -1,
      };
    // A distinct revision also restores already-patched fog shaders when switching modes.
    return { ...view, settlement: { ...view.settlement, fog: this.fullFog } };
  }
}
export const MATCH_SPEEDS = [1, 2, 3, 4] as const;
export function matchSpeed(requested: number, remote: boolean): number {
  return !remote && MATCH_SPEEDS.includes(requested as 1 | 2 | 3 | 4)
    ? requested
    : 1;
}
