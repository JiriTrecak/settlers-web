import {sceneryCatalogue as catalogJson} from '../assets/manifest';
import {parseCatalogue, type CatalogEntry} from '../asset/catalog';
import type {UtcMap} from './utcmap';
const catalog=parseCatalogue(catalogJson);
if(!catalog)throw new Error('Invalid environment catalogue');
export const sceneryRules=catalog.assets.filter(e=>e.blocker||e.blockers?.length||e.deck).map(e=>({id:e.id,blocker:e.blocker,blockers:e.blockers,deck:e.deck}));
/** Same authored collision used by simulation and AI briefing. Stamp yaw is radians. */
export function applySceneryBlockers(map:{size:number;stamps:UtcMap['stamps']},land:{[index:number]:number},entries:readonly CatalogEntry[]=catalog!.assets):void {
 const definitions=new Map(entries.map(e=>[e.id,[...(e.blocker?[e.blocker]:[]),...e.blockers??[]]]));
 for(const stamp of map.stamps)for(const b of definitions.get(stamp.asset)??[]){
  const sx=(stamp.scale??1)*(stamp.widthScale??1),sz=(stamp.scale??1)*(stamp.depthScale??1);
  const c=Math.cos(stamp.yaw??0),s=Math.sin(stamp.yaw??0),bc=Math.cos(b.yaw??0),bs=Math.sin(b.yaw??0);
  const hw=b.width/2,hd=b.depth/2,margin=.35/Math.min(Math.abs(sx),Math.abs(sz));
  let loX=Infinity,hiX=-Infinity,loZ=Infinity,hiZ=-Infinity;
  for(const x of [-hw-margin,hw+margin])for(const z of [-hd-margin,hd+margin]){
   const lx=((b.x??0)+bc*x+bs*z)*sx,lz=((b.z??0)-bs*x+bc*z)*sz;
   const wx=stamp.x+c*lx+s*lz,wz=stamp.y-s*lx+c*lz;
   loX=Math.min(loX,wx);hiX=Math.max(hiX,wx);loZ=Math.min(loZ,wz);hiZ=Math.max(hiZ,wz);
  }
  for(let y=Math.max(0,Math.floor(loZ));y<=Math.min(map.size-1,Math.ceil(hiZ));y++)
   for(let x=Math.max(0,Math.floor(loX));x<=Math.min(map.size-1,Math.ceil(hiX));x++){
    // Invert the full asset transform before each local footprint. This also
    // handles nonuniformly scaled curved walls without closing their doorway.
    const dx=x-stamp.x,dz=y-stamp.y,ax=(c*dx-s*dz)/sx-(b.x??0),az=(s*dx+c*dz)/sz-(b.z??0);
    const lx=bc*ax-bs*az,lz=bs*ax+bc*az;
    const inside=b.shape==='ellipse'?(lx/(hw+margin))**2+(lz/(hd+margin))**2<=1:Math.abs(lx)<=hw+margin&&Math.abs(lz)<=hd+margin;
    if(inside)land[y*map.size+x]=0;
   }
 }
}
