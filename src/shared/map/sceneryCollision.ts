import {sceneryCatalogue as catalogJson} from '../assets/manifest';
import {parseCatalogue, type CatalogEntry} from '../asset/catalog';
import type {UtcMap} from './utcmap';
const catalog=parseCatalogue(catalogJson);
if(!catalog)throw new Error('Invalid environment catalogue');
export const sceneryRules=catalog.assets.filter(e=>e.blocker||e.deck).map(e=>({id:e.id,blocker:e.blocker,deck:e.deck}));
/** Same authored collision used by simulation and AI briefing. Stamp yaw is radians. */
export function applySceneryBlockers(map:{size:number;stamps:UtcMap['stamps']},land:{[index:number]:number},entries:readonly CatalogEntry[]=catalog!.assets):void {
 const definitions=new Map(entries.filter(e=>e.blocker).map(e=>[e.id,e.blocker!]));
 for(const stamp of map.stamps){
  const b=definitions.get(stamp.asset);if(!b)continue;
  const sx=(stamp.scale??1)*(stamp.widthScale??1),sz=(stamp.scale??1)*(stamp.depthScale??1);
  const hw=b.width*Math.abs(sx)/2,hd=b.depth*Math.abs(sz)/2;
  const c=Math.cos(stamp.yaw??0),s=Math.sin(stamp.yaw??0);
  const rx=Math.abs(c)*hw+Math.abs(s)*hd,rz=Math.abs(s)*hw+Math.abs(c)*hd;
  for(let y=Math.max(0,Math.floor(stamp.y-rz));y<=Math.min(map.size-1,Math.ceil(stamp.y+rz));y++)
   for(let x=Math.max(0,Math.floor(stamp.x-rx));x<=Math.min(map.size-1,Math.ceil(stamp.x+rx));x++){
    // Cell centres and prop origins both have the same +0.5 world offset.
    const dx=x-stamp.x,dz=y-stamp.y;
    if(Math.abs(c*dx-s*dz)<=hw+.35&&Math.abs(s*dx+c*dz)<=hd+.35)land[y*map.size+x]=0;
   }
 }
}
