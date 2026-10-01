/** Render-only biome scenery. Distances are world units, never map placements. */
export type ForestSurroundings = {
  trunk: string;
  floorTexture:string;
  floorColor:string;
  mushroom?: string;
  log?: string;
  rings: readonly {distance: number; spacing: number; height: number}[];
  leafColors: readonly string[];
  hazeColor: string;
  hazeStart: number;
  hazeEnd: number;
  closeShaftDensity:number;
  /** Far-only lens blur: world distances, radius in pixels at 1080p. */
  depthOfField?: {start:number; end:number; radius:number};
  leafSpacing: number;
  leafLength: number;
};

export type ForestAnchor = {x:number; z:number; height:number; yaw:number; radius:number; ring:number};
export function forestRandom(seed:number):()=>number {
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
/** Square perimeters keep the clearance identical at corners and along edges.
 * Budget grows with perimeter, not map area. No camera or simulation state. */
export function forestAnchors(size:number,seed:number,profile:ForestSurroundings):ForestAnchor[] {
  const random=forestRandom(seed),out:ForestAnchor[]=[];
  profile.rings.forEach((ring,index)=>{
    const span=size+ring.distance*2, count=Math.min(32,Math.ceil(span/ring.spacing));
    for(let side=0;side<4;side++)for(let i=0;i<count;i++){
      const along=-ring.distance+span*(i+.2+random()*.6)/count;
      const outside=ring.distance+random()*18;
      const [x,z]=side===0?[along,-outside]:side===1?[size+outside,along]:side===2?[size-along,size+outside]:[-outside,size-along];
      out.push({x,z,height:ring.height*(.85+random()*.3),yaw:random()*Math.PI*2,radius:13+random()*7,ring:index});
    }
  });
  return out;
}
