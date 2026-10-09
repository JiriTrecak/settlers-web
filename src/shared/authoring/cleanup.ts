import {z} from 'zod';
import type {AuthoringScene} from './layers';
import type {LandscapeAsset} from './catalogue';
import type {MapStamp} from '../map/utcmap';
import type {GroundDecal} from '../landscape/decal';
export type Decorations={stamps:readonly MapStamp[];decals:readonly GroundDecal[]};
const point=z.object({x:z.number().finite(),z:z.number().finite()}).strict();
export const cleanupAreaSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('brush'),points:z.array(point).min(1).max(8192),radius:z.number().positive().max(512)}).strict(),
 z.object({type:z.literal('rectangle'),from:point,to:point}).strict(),
 z.object({type:z.literal('lasso'),points:z.array(point).min(3).max(8192)}).strict(),
]);
export const cleanupRequestSchema=z.object({
 area:cleanupAreaSchema,
 kinds:z.array(z.enum(['tree','foliage','prop','building','bridge','unit','creature','decal'])).default(['tree','foliage','prop']),
 assets:z.array(z.string().min(1)).max(4096).optional(),
}).strict();
export type CleanupRequest=z.infer<typeof cleanupRequestSchema>;
export type CleanupArea=z.infer<typeof cleanupAreaSchema>;
const segmentDistance=(x:number,z:number,a:{x:number;z:number},b:{x:number;z:number})=>{
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
};
/** A drag is a continuous swept brush, not disconnected dabs. Shared by preview
 * and deletion so the count always describes exactly what Apply will remove. */
export function areaContains(area:CleanupArea,x:number,z:number):boolean{
 if(area.type==='rectangle')return x>=Math.min(area.from.x,area.to.x)&&x<=Math.max(area.from.x,area.to.x)&&z>=Math.min(area.from.z,area.to.z)&&z<=Math.max(area.from.z,area.to.z);
 if(area.type==='brush')return area.points.some((p,i)=>segmentDistance(x,z,p,area.points[Math.min(i+1,area.points.length-1)])<=area.radius);
 let inside=false;
 for(let i=0,j=area.points.length-1;i<area.points.length;j=i++){
  const a=area.points[j],b=area.points[i];if(segmentDistance(x,z,a,b)<1e-8)return true;
  if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
}
export function cleanupPreview(scene:AuthoringScene,request:CleanupRequest,catalogue:readonly LandscapeAsset[],decorations?:Decorations){
 const input=cleanupRequestSchema.parse(request),assets=new Map(catalogue.map(a=>[a.id,a]));
 const ids:string[]=[],locked:string[]=[];
 for(const object of scene.objects){
  const asset=assets.get(object.asset);
  if(!asset||!input.kinds.some(kind=>kind===asset.kind)||(input.assets&&!input.assets.includes(object.asset))||!areaContains(input.area,object.x,object.z))continue;
  (object.locked?locked:ids).push(object.id);
 }
 const stampIds:string[]=[],decalIds:string[]=[];
 const scenery=new Map(catalogue.filter(a=>a.scenery).map(a=>[a.scenery,a]));
 for(const stamp of decorations?.stamps??[]){
  const asset=scenery.get(stamp.asset);
  if(!asset||!input.kinds.some(kind=>kind===asset.kind)||(input.assets&&!input.assets.includes(asset.id)&&!input.assets.includes(stamp.asset))||!areaContains(input.area,stamp.x,stamp.y))continue;
  (stamp.locked?locked:stampIds).push(stamp.id);
 }
 if(input.kinds.includes('decal'))for(const decal of decorations?.decals??[]){
  if((input.assets&&!input.assets.includes(decal.kind))||!areaContains(input.area,decal.x,decal.z))continue;
  (decal.locked?locked:decalIds).push(decal.id);
 }
 return {ids,stampIds,decalIds,count:ids.length+stampIds.length+decalIds.length,locked,lockedCount:locked.length};
}
export function cleanupScene(scene:AuthoringScene,request:CleanupRequest,catalogue:readonly LandscapeAsset[]):AuthoringScene{
 const remove=new Set(cleanupPreview(scene,request,catalogue).ids);
 return {...scene,objects:scene.objects.filter(o=>!remove.has(o.id))};
}
