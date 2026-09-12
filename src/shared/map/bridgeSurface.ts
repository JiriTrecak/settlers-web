import {sceneryCatalogue as catalogJson} from '../assets/manifest';
import {parseCatalogue} from '../asset/catalog';
import type {MapStamp} from './utcmap';
const definitions=new Map(parseCatalogue(catalogJson)!.assets.filter(e=>e.deck).map(e=>[e.id,e.deck!]));
export type BridgeSurface={x:number;z:number;base:number;c:number;s:number;width:number;depth:number;height:number;arch:number};
export function bridgeSurfaces(stamps:readonly MapStamp[],ground:(x:number,z:number)=>number):BridgeSurface[]{
 return stamps.flatMap(stamp=>{
  const d=definitions.get(stamp.asset);if(!d)return [];
  const scale=stamp.scale??1,vertical=scale*(stamp.heightScale??1);
  return [{x:stamp.x+.5,z:stamp.y+.5,base:ground(stamp.x+.5,stamp.y+.5)+(stamp.elevation??0),c:Math.cos(stamp.yaw??0),s:Math.sin(stamp.yaw??0),width:d.width*scale*(stamp.widthScale??1),depth:d.depth*scale*(stamp.depthScale??1),height:d.height*vertical,arch:d.arch*vertical}];
 });
}
/** A separate walk surface: does not change terrain, water depth or construction. */
export function bridgeHeight(surfaces:readonly BridgeSurface[],x:number,z:number):number|undefined {
 let height:number|undefined;
 for(const b of surfaces){
  const dx=x-b.x,dz=z-b.z,lx=b.c*dx-b.s*dz,lz=b.s*dx+b.c*dz;
  if(Math.abs(lx)>b.width/2||Math.abs(lz)>b.depth/2)continue;
  const y=b.base+b.height+b.arch*Math.cos(lz*Math.PI/b.depth);
  height=height===undefined?y:Math.max(y,height);
 }
 return height;
}
export function applyBridgeSurfaces(size:number,surfaces:readonly BridgeSurface[],land:{[index:number]:number},heights:{[index:number]:number}):Uint8Array {
 const decks=new Uint8Array(size*size);
 for(const b of surfaces){
  const radius=Math.hypot(b.width,b.depth)/2;
  for(let z=Math.max(0,Math.floor(b.z-radius));z<=Math.min(size-1,Math.ceil(b.z+radius));z++)
   for(let x=Math.max(0,Math.floor(b.x-radius));x<=Math.min(size-1,Math.ceil(b.x+radius));x++){
    const h=bridgeHeight([b],x+.5,z+.5);if(h===undefined)continue;
    const i=z*size+x;decks[i]=1;land[i]=1;heights[i]=Math.round(h*100);
   }
 }
 return decks;
}
