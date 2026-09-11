import type { World, ViewSnapshot } from "../../sim/world/world";
import type { FogView } from "../../sim/game/observation";

/** Presentation only. Never pass this view to the command adapter or an AI controller. */
export class PresentationView {
  private sceneFog: FogView | undefined;
  private sceneKey = "";
  private sceneRevision = -1000;
  private sceneWorld: World | undefined;
  private fullFog: FogView | undefined;
  project(world: World, visionPlayer: number, reveal: boolean): ViewSnapshot {
    if (!reveal) {
      const normal=world.view(visionPlayer),scene=normal.settlement?.mission?.scene;
      if(!scene || normal.settlement.outcome || !normal.settlement.fog)return normal;
      // Camera staging reveals only its set, without exploring it or giving AI vision.
      const radius=24,fog=normal.settlement.fog,key=`${visionPlayer}:${fog.revision}:${scene.x}:${scene.y}`;
      if(this.sceneWorld!==world||this.sceneKey!==key){
        const cells=fog.cells.slice();
        for(let y=Math.max(0,Math.floor(scene.y-radius));y<=Math.min(normal.size-1,scene.y+radius);y++)
          for(let x=Math.max(0,Math.floor(scene.x-radius));x<=Math.min(normal.size-1,scene.x+radius);x++)
            if(Math.hypot(x-scene.x,y-scene.y)<=radius)cells[y*normal.size+x]=2;
        this.sceneFog={cells,revision:--this.sceneRevision,owner:-2};this.sceneWorld=world;this.sceneKey=key;
      }
      const entities=new Map(normal.settlement.entities.map(e=>[e.id,e]));
      for(const e of world.view().settlement.entities)if(Math.hypot(e.x-scene.x,e.y-scene.y)<=radius)entities.set(e.id,e);
      return {...normal,settlement:{...normal.settlement,entities:[...entities.values()],fog:this.sceneFog}};
    }
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
