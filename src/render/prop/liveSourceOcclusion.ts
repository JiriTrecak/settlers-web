import {unpackSourceBytes,type ImportedTerrain} from '../../shared/map/importedTerrain';
import type {MapStamp} from '../../shared/map/utcmap';
import {sampleSprite,spriteOcclusion} from '../../shared/map/occlusionSprites';
export type OcclusionRect={x0:number;z0:number;x1:number;z1:number};
type Plant=NonNullable<NonNullable<ImportedTerrain['occlusion']>['dynamic']>['plants'][number];
type Caster={source:Plant;x:number;z:number;scale:number;active:boolean;sectors:number[]};
const cache=new WeakMap<ImportedTerrain,LiveSourceOcclusion>();
export function liveSourceOcclusion(source:ImportedTerrain){
 let state=cache.get(source);if(!state){state=new LiveSourceOcclusion(source);cache.set(source,state);}return state;
}
/** Event-driven 16×16 sectors. Rebuild only changed footprints and overlapping
 * casters; leave the serialized source raster immutable for export/comparison. */
export class LiveSourceOcclusion {
 readonly rgba:Uint8Array;
 readonly size:readonly [number,number];
 private readonly base:Uint8Array;
 private readonly sprite:Uint8Array;
 private readonly casters:Caster[]=[];
 private readonly sectors=new Map<number,Set<Caster>>();
 private readonly listeners=new Set<(rect:OcclusionRect)=>void>();
 private readonly columns:number;
 private lastStamps:readonly MapStamp[]|undefined;
 lastUpdate={sectors:0,texels:0,casterVisits:0};
 constructor(readonly source:ImportedTerrain){
  const ao=source.occlusion;this.size=ao?.size??[1,1];this.columns=Math.ceil(this.size[0]/16);
  this.rgba=ao?unpackSourceBytes(ao.rgba):new Uint8Array([255,255,255,0]);
  const dynamic=ao?.dynamic;this.base=dynamic?unpackSourceBytes(dynamic.base):this.rgba.slice();this.sprite=dynamic?unpackSourceBytes(dynamic.sprite.red):new Uint8Array();
  for(const p of dynamic?.plants??[]){const c:Caster={source:p,x:p.x,z:p.z,scale:p.scale,active:true,sectors:[]};this.casters.push(c);this.insert(c);}
 }
 get subscriberCount(){return this.listeners.size;}
 subscribe(listener:(rect:OcclusionRect)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
 private bounds(c:Caster):OcclusionRect{
  const sx=c.source.size[0]*c.scale/2,sz=c.source.size[1]*c.scale/2,x=c.x-this.source.origin[0],z=c.z-this.source.origin[1];
  return {x0:Math.max(0,Math.ceil(x-sx)),x1:Math.min(this.size[0]-1,Math.floor(x+sx)),z0:Math.max(0,Math.ceil(z-sz)),z1:Math.min(this.size[1]-1,Math.floor(z+sz))};
 }
 private insert(c:Caster){
  const b=this.bounds(c);c.sectors=[];if(b.x0>b.x1||b.z0>b.z1||!c.active)return;
  for(let z=Math.floor(b.z0/16);z<=Math.floor(b.z1/16);z++)for(let x=Math.floor(b.x0/16);x<=Math.floor(b.x1/16);x++){
   const id=z*this.columns+x;let set=this.sectors.get(id);if(!set){set=new Set();this.sectors.set(id,set);}set.add(c);c.sectors.push(id);
  }
 }
 sync(stamps:readonly MapStamp[]){
  if(this.lastStamps===stamps)return;this.lastStamps=stamps;
  if(!this.casters.length)return;
  const placed=new Map(stamps.map(s=>[s.id,s])),dirty=new Set<number>();
  for(const c of this.casters){
   const s=placed.get(c.source.id),active=!!s&&s.asset===c.source.asset,x=s?s.x+.5:c.x,z=s?s.y+.5:c.z,scale=s?(s.scale??1):c.scale;
   if(c.active===active&&c.x===x&&c.z===z&&c.scale===scale)continue;
   for(const id of c.sectors){this.sectors.get(id)?.delete(c);dirty.add(id);}
   c.x=x;c.z=z;c.scale=scale;c.active=active;this.insert(c);for(const id of c.sectors)dirty.add(id);
  }
  this.lastUpdate={sectors:dirty.size,texels:0,casterVisits:0};
  for(const id of dirty)this.rebuild(id);
 }
 private rebuild(id:number){
  const [w,h]=this.size,x0=id%this.columns*16,z0=Math.floor(id/this.columns)*16,x1=Math.min(w-1,x0+15),z1=Math.min(h-1,z0+15);
  const before=new Uint8Array((x1-x0+1)*(z1-z0+1)*4),rowBytes=(x1-x0+1)*4;
  for(let z=z0;z<=z1;z++)before.set(this.rgba.subarray((z*w+x0)*4,(z*w+x1+1)*4),(z-z0)*rowBytes);
  this.lastUpdate.texels+=(x1-x0+1)*(z1-z0+1);
  for(let z=z0;z<=z1;z++)this.rgba.set(this.base.subarray((z*w+x0)*4,(z*w+x1+1)*4),(z*w+x0)*4);
  const spriteSize=this.source.occlusion!.dynamic!.sprite.size;
  for(const c of this.sectors.get(id)??[]){
   this.lastUpdate.casterVisits++;const b=this.bounds(c),height=c.source.height*c.scale/c.source.scale;
   for(let z=Math.max(z0,b.z0);z<=Math.min(z1,b.z1);z++)for(let x=Math.max(x0,b.x0);x<=Math.min(x1,b.x1);x++){
    const u=(x+this.source.origin[0]-c.x)/(c.source.size[0]*c.scale)+.5,v=(z+this.source.origin[1]-c.z)/(c.source.size[1]*c.scale)+.5;
    const bands=spriteOcclusion(sampleSprite(this.sprite,...spriteSize,u,v),u,v,height,c.source.intensity),offset=(z*w+x)*4;
    for(let k=0;k<3;k++)this.rgba[offset+k]=Math.min(this.rgba[offset+k]!,Math.round(bands[k]!*255));
    this.rgba[offset+3]=Math.max(this.rgba[offset+3]!,Math.round(bands[3]*255));
   }
  }
  // Most overlapping trees hide the edited caster's contribution. Do not
  // resample/upload a whole sector when only a few output texels changed.
  const rect:OcclusionRect={x0:x1+1,z0:z1+1,x1:x0-1,z1:z0-1};
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const a=((z-z0)*(x1-x0+1)+x-x0)*4,b=(z*w+x)*4;
   if(before[a]===this.rgba[b]&&before[a+1]===this.rgba[b+1]&&before[a+2]===this.rgba[b+2]&&before[a+3]===this.rgba[b+3])continue;
   rect.x0=Math.min(rect.x0,x);rect.x1=Math.max(rect.x1,x);rect.z0=Math.min(rect.z0,z);rect.z1=Math.max(rect.z1,z);
  }
  if(rect.x0<=rect.x1&&rect.z0<=rect.z1)for(const listener of this.listeners)listener(rect);
 }
}
