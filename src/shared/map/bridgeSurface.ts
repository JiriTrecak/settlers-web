import {sceneryCatalogue as catalogJson} from '../assets/manifest';
import {parseCatalogue} from '../asset/catalog';
import type {MapStamp} from './utcmap';
const definitions=new Map(parseCatalogue(catalogJson)!.assets.filter(e=>e.deck).map(e=>[e.id,e.deck!]));
export type BridgeSurface={rampLengths?:readonly [number,number];triangles?:readonly (readonly [number,number,number])[];id:string;level:number;connections?:{start?:number;end?:number};x:number;z:number;base:number;c:number;s:number;width:number;depth:number;height:number;arch:number;rise?:number;thickness:number};
/** The same absolute placement is used by the visible mesh and navigation. */
export function bridgePlacementHeight(stamp:MapStamp,ground:(x:number,z:number)=>number):number {
 if(stamp.sourceTransform)return stamp.sourceTransform.height;
 const d=definitions.get(stamp.asset);
 if(d&&stamp.walk?.height!==undefined)return stamp.walk.height-(d.height+d.arch+(d.rise??0)/2)*(stamp.scale??1)*(stamp.heightScale??1);
 return ground(stamp.x+.5,stamp.y+.5)+(stamp.elevation??0);
}
export function bridgeSurfaces(stamps:readonly MapStamp[],ground:(x:number,z:number)=>number):BridgeSurface[]{
 return stamps.flatMap(stamp=>{
  if(stamp.walk?.mesh&&stamp.sourceTransform)return [meshSurface(stamp)];
  const d=definitions.get(stamp.asset);if(!d)return [];
  const scale=stamp.scale??1,vertical=scale*(stamp.heightScale??1);
  return [{id:stamp.id,level:stamp.walk?.level??d.level,connections:stamp.walk?.connections??d.connections,x:stamp.x+.5,z:stamp.y+.5,base:bridgePlacementHeight(stamp,ground),c:Math.cos(stamp.yaw??0),s:Math.sin(stamp.yaw??0),width:d.width*scale*(stamp.widthScale??1),depth:d.depth*scale*(stamp.depthScale??1),height:d.height*vertical,arch:d.arch*vertical,rise:(d.rise??0)*vertical,thickness:(d.thickness??.6)*vertical}];
 });
}
export function surfaceHeight(b:BridgeSurface,x:number,z:number):number|undefined {
 if(b.triangles){
  let height:number|undefined;
  for(let i=0;i<b.triangles.length;i+=3){
   const a=b.triangles[i]!,c=b.triangles[i+1]!,d=b.triangles[i+2]!;
   const det=(c[2]-d[2])*(a[0]-d[0])+(d[0]-c[0])*(a[2]-d[2]);if(Math.abs(det)<1e-10)continue;
   const u=((c[2]-d[2])*(x-d[0])+(d[0]-c[0])*(z-d[2]))/det,v=((d[2]-a[2])*(x-d[0])+(a[0]-d[0])*(z-d[2]))/det;
   if(u<-.00001||v<-.00001||u+v>1.00001)continue;const h=u*a[1]+v*c[1]+(1-u-v)*d[1];height=height===undefined?h:Math.max(height,h);
  }return height;
 }
 const dx=x-b.x,dz=z-b.z,lx=b.c*dx-b.s*dz,lz=b.s*dx+b.c*dz;
 if(Math.abs(lx)>b.width/2||Math.abs(lz)>b.depth/2)return undefined;
 return b.base+b.height+b.arch*Math.cos(lz*Math.PI/b.depth)+(b.rise??0)*(lz/b.depth+.5);
}
/** A separate walk surface: does not change terrain, water depth or construction. */
export function bridgeHeight(surfaces:readonly BridgeSurface[],x:number,z:number):number|undefined {
 let height:number|undefined;
 for(const b of surfaces){
  const y=surfaceHeight(b,x,z);if(y===undefined)continue;
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

/** Transform the original helper triangles with the same quaternion/scale as the visible GLB. */
function meshSurface(stamp:MapStamp):BridgeSurface {
 const transform=stamp.sourceTransform!,mesh=stamp.walk!.mesh!,q=transform.quaternion,[qx,qy,qz,qw]=q,s=stamp.scale??1;
 const positions=mesh.positions.map(([px,py,pz]):[number,number,number]=>{
  const x=px*s*(stamp.widthScale??1),y=py*s*(stamp.heightScale??1),z=pz*s*(stamp.depthScale??1);
  const tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
  return [stamp.x+.5+x+qw*tx+qy*tz-qz*ty,transform.height+y+qw*ty+qz*tx-qx*tz,stamp.y+.5+z+qw*tz+qx*ty-qy*tx];
 });
 const yaw=Math.atan2(2*(qw*qy+qx*qz),1-2*(qy*qy+qz*qz)),c=Math.cos(yaw),sn=Math.sin(yaw);
 let loX=Infinity,hiX=-Infinity,loZ=Infinity,hiZ=-Infinity;
 for(const p of positions){const x=c*p[0]-sn*p[2],z=sn*p[0]+c*p[2];loX=Math.min(loX,x);hiX=Math.max(hiX,x);loZ=Math.min(loZ,z);hiZ=Math.max(hiZ,z);}
 const cx=(loX+hiX)/2,cz=(loZ+hiZ)/2;
 const top=Math.max(...mesh.positions.map(p=>p[1])),flat=mesh.positions.filter(p=>Math.abs(p[1]-top)<.001),minZ=Math.min(...mesh.positions.map(p=>p[2])),maxZ=Math.max(...mesh.positions.map(p=>p[2]));
 const rampLengths:[number,number]=[(Math.min(...flat.map(p=>p[2]))-minZ)*s*(stamp.depthScale??1),(maxZ-Math.max(...flat.map(p=>p[2])))*s*(stamp.depthScale??1)];
 return {rampLengths,id:stamp.id,level:stamp.walk!.level,connections:stamp.walk!.connections,x:c*cx+sn*cz,z:-sn*cx+c*cz,c,s:sn,base:transform.height,width:hiX-loX,depth:hiZ-loZ,height:0,arch:0,thickness:.3,triangles:mesh.indices.map(i=>positions[i]!)};
}
