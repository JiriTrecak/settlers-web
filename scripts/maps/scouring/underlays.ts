import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {Matrix4,Quaternion,Vector3} from 'three';
import type {MapStamp} from '../../../src/shared/map/utcmap';

type Part={positions:number[][];uv:number[][];indices:number[];alpha:Uint8Array;width:number;height:number};
/** Rasterize the original underlay triangles and alpha at a declared texel density.
 * Source shaders consume this mask to suppress grass and painted terrain layers.
 * Source RT resolution/blend state is not stored in the level; max-alpha is explicit. */
export async function rasterUnderlays(stamps:readonly MapStamp[],paths:Map<string,string>,origin:readonly number[],blocks:readonly number[],density=3){
 if(!Number.isInteger(density)||density<1||density>8)throw Error('Unsupported underlay texel density');
 const width=blocks[0]!*16*density+1,height=blocks[1]!*16*density+1,mask=new Uint8Array(width*height);
 const cache=new Map<string,Promise<Part[]>>();let instances=0;
 async function parts(path:string):Promise<Part[]>{
  const bytes=readFileSync(path),jsonSize=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+jsonSize).toString()),binary=bytes.subarray(28+jsonSize);
  function accessor(index:number){
   const a=g.accessors[index],v=g.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type as string]!;
   if(!n||![5123,5126].includes(a.componentType))throw Error('Unsupported source underlay accessor');
   const size=a.componentType===5126?4:2,stride=v.byteStride??n*size,start=(v.byteOffset??0)+(a.byteOffset??0);
   return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>size===4?binary.readFloatLE(start+i*stride+j*size):binary.readUInt16LE(start+i*stride+j*size)));
  }
  const result:Part[]=[];
  for(const node of g.nodes){
   if(node.mesh===undefined)continue;
   for(const p of g.meshes[node.mesh].primitives){
    const mat=g.materials[p.material];if(!mat.extras?.underlay)continue;
    if(node.matrix||node.translation||node.rotation||node.scale)throw Error('Source underlay node transforms must be baked before rasterization');
    const image=g.images[g.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source],v=g.bufferViews[image.bufferView];
    const {data,info}=await sharp(binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=new Uint8Array(info.width*info.height);for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3]!;
    result.push({positions:accessor(p.attributes.POSITION),uv:accessor(p.attributes.TEXCOORD_0),indices:accessor(p.indices).flat(),alpha,width:info.width,height:info.height});
   }
  }return result;
 }
 const matrix=new Matrix4(),q=new Quaternion(),v=new Vector3();
 for(const stamp of stamps){
  if(!stamp.sourceTransform)continue;
  const path=paths.get(stamp.asset);if(!path)throw Error(`Missing source mesh for underlay ${stamp.asset}`);
  if(!cache.has(path))cache.set(path,parts(path));const meshes=await cache.get(path)!;if(meshes.length)instances++;
  const t=stamp.sourceTransform;q.fromArray(t.quaternion);matrix.compose(new Vector3(stamp.x+.5,t.height,stamp.y+.5),q,new Vector3().setScalar(stamp.scale??1));
  for(const part of meshes){
   const positions=part.positions.map(p=>{v.fromArray(p).applyMatrix4(matrix);return [(v.x-origin[0]!)*density,(v.z-origin[1]!)*density];});
   for(let i=0;i<part.indices.length;i+=3){
    const ia=part.indices[i]!,ib=part.indices[i+1]!,ic=part.indices[i+2]!,a=positions[ia]!,b=positions[ib]!,c=positions[ic]!;
    const denominator=(b[1]!-c[1]!)*(a[0]!-c[0]!)+(c[0]!-b[0]!)*(a[1]!-c[1]!);if(Math.abs(denominator)<1e-8)continue;
    const minX=Math.max(0,Math.ceil(Math.min(a[0]!,b[0]!,c[0]!))),maxX=Math.min(width-1,Math.floor(Math.max(a[0]!,b[0]!,c[0]!)));
    const minZ=Math.max(0,Math.ceil(Math.min(a[1]!,b[1]!,c[1]!))),maxZ=Math.min(height-1,Math.floor(Math.max(a[1]!,b[1]!,c[1]!)));
    for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
     const wa=((b[1]!-c[1]!)*(x-c[0]!)+(c[0]!-b[0]!)*(z-c[1]!))/denominator;
     const wb=((c[1]!-a[1]!)*(x-c[0]!)+(a[0]!-c[0]!)*(z-c[1]!))/denominator,wc=1-wa-wb;if(Math.min(wa,wb,wc)<-1e-6)continue;
     const uv=[0,1].map(k=>wa*part.uv[ia]![k]!+wb*part.uv[ib]![k]!+wc*part.uv[ic]![k]!);
     const px=((uv[0]!%1+1)%1)*part.width-.5,pz=((uv[1]!%1+1)%1)*part.height-.5;
     const ix=Math.floor(px),iz=Math.floor(pz),fx=px-ix,fz=pz-iz;
     const at=(xx:number,zz:number)=>part.alpha[((zz+part.height)%part.height)*part.width+(xx+part.width)%part.width]!;
     const alpha=(at(ix,iz)*(1-fx)+at(ix+1,iz)*fx)*(1-fz)+(at(ix,iz+1)*(1-fx)+at(ix+1,iz+1)*fx)*fz;
     mask[z*width+x]=Math.max(mask[z*width+x]!,Math.round(alpha));
    }
   }
  }
 }
 return {size:[width,height] as [number,number],mask,instances,density,blend:'maximum-alpha' as const};
}
