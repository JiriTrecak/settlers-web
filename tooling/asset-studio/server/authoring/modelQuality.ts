import sharp from 'sharp';
import type {AssetDefinition} from '../../../../src/shared/authoring/asset';
import {hash} from '../storage';

export const MODEL_LIMITS={unit:5000,creature:5000,building:10000} as const;
export type ModelQuality={sha256:string;triangles:number;primitives:number;bones:number;textures:number;textureBytes:number;clips:{name:string;duration:number}[];materials:string[];warnings:string[]};
type Document=Record<string,any>;
export function readGlb(bytes:Buffer):{doc:Document;bin:Buffer}{
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB header');
 let offset=12,doc:Document|undefined,chunks=0;let bin:Buffer=Buffer.alloc(0);
 while(offset<bytes.length){
  if(offset+8>bytes.length)throw Error('Truncated GLB chunk');
  const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;
  if(length%4||offset+length>bytes.length)throw Error('Invalid GLB chunk bounds');
  if(chunks++===0){if(type!==0x4e4f534a)throw Error('GLB JSON must be first');doc=JSON.parse(bytes.toString('utf8',offset,offset+length).trim());}
  else if(type===0x004e4942){if(bin.length)throw Error('Duplicate GLB binary chunk');bin=bytes.subarray(offset,offset+length);}
  offset+=length;
 }
 if(!doc||doc.asset?.version!=='2.0')throw Error('Expected glTF 2.0');
 if([...doc.buffers??[],...doc.images??[]].some(r=>r.uri))throw Error('Runtime GLB must embed dependencies in its binary chunk');
 if(doc.buffers?.length>1||doc.buffers?.[0]?.byteLength>bin.length)throw Error('Invalid GLB buffer length');
 return {doc,bin};
}
const cache=new Map<string,Promise<{report:ModelQuality;doc:Document}>>();
async function measure(bytes:Buffer){
 const {doc,bin}=readGlb(bytes),views=doc.bufferViews??[],accessors=doc.accessors??[];
 for(const v of views)if((v.buffer??0)!==0||!Number.isInteger(v.byteLength)||v.byteLength<0||(v.byteOffset??0)<0||(v.byteOffset??0)+v.byteLength>bin.length)throw Error('GLB buffer view outside binary data');
 const arities:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
 const sizes:Record<number,number>={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
 const data=new DataView(bin.buffer,bin.byteOffset,bin.length);
 const scalar=(at:number,type:number)=>type===5126?data.getFloat32(at,true):type===5125?data.getUint32(at,true):type===5123?data.getUint16(at,true):type===5122?data.getInt16(at,true):type===5121?data.getUint8(at):data.getInt8(at);
 const values:number[][]=accessors.map((a:any,i:number)=>{
  const width=arities[a.type],size=sizes[a.componentType],v=views[a.bufferView];
  if(a.sparse)throw Error(`Accessor ${i}: sparse export is unsupported; bake before publishing`);
  if(!width||!size||!v||!Number.isInteger(a.count)||a.count<0)throw Error(`Invalid accessor ${i}`);
  const stride=v.byteStride??width*size,start=(v.byteOffset??0)+(a.byteOffset??0),last=start+Math.max(0,a.count-1)*stride+width*size;
  if(stride<width*size||start<(v.byteOffset??0)||a.count&&last>(v.byteOffset??0)+v.byteLength)throw Error(`Accessor ${i} exceeds its buffer view`);
  const out:number[]=[];
  for(let row=0;row<a.count;row++)for(let c=0;c<width;c++){let value=scalar(start+row*stride+c*size,a.componentType);if(!Number.isFinite(value))throw Error(`Accessor ${i} has non-finite values`);if(a.normalized)value=a.componentType===5121?value/255:a.componentType===5123?value/65535:value;out.push(value);}
  return out;
 });
 const nodes=doc.nodes??[],meshes=doc.meshes??[];let triangles=0,primitives=0;
 const visited=new Set<number>(),active=new Set<number>(),bones=new Set<number>();
 const visit=(id:number)=>{
  if(!Number.isInteger(id)||!nodes[id])throw Error('Missing scene node');
  if(active.has(id)||visited.has(id))throw Error('Cyclic or multiply parented GLB nodes');active.add(id);visited.add(id);
  const n=nodes[id];for(const key of ['translation','rotation','scale','matrix'])if(n[key]?.some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Non-finite node transform');
  const skin=n.skin===undefined?undefined:doc.skins?.[n.skin];if(n.skin!==undefined&&!skin)throw Error('Missing skin');
  if(skin)for(const joint of skin.joints){if(!nodes[joint])throw Error('Skin references missing bone');bones.add(joint);}
  if(n.mesh!==undefined){const mesh=meshes[n.mesh];if(!mesh)throw Error('Missing mesh');for(const p of mesh.primitives){
   if((p.mode??4)!==4)throw Error('Runtime geometry must be triangulated');
   const position=accessors[p.attributes?.POSITION];if(position?.type!=='VEC3'||!position.count)throw Error('Primitive has no positions');
   const indices=p.indices===undefined?undefined:values[p.indices];if(p.indices!==undefined&&!indices)throw Error('Missing indices');
   if(indices?.some(i=>!Number.isInteger(i)||i<0||i>=position.count))throw Error('Index outside vertex buffer');
   const count=indices?.length??position.count;if(count%3)throw Error('Triangle index count is not divisible by three');triangles+=count/3;primitives++;
   for(const index of Object.values(p.attributes) as number[])if(accessors[index]?.count!==position.count)throw Error('Vertex attribute counts disagree');
   if(p.material!==undefined&&!doc.materials?.[p.material])throw Error('Missing material');
   if(skin){const joints=values[p.attributes.JOINTS_0],weights=values[p.attributes.WEIGHTS_0];if(doc.accessors[p.attributes.JOINTS_0]?.type!=='VEC4'||doc.accessors[p.attributes.WEIGHTS_0]?.type!=='VEC4'||!joints||!weights||joints.length!==weights.length)throw Error('Skinned primitive is missing joint weights');for(let i=0;i<joints.length;i+=4){let sum=0;for(let c=0;c<4;c++){if(!Number.isInteger(joints[i+c])||joints[i+c]<0||joints[i+c]>=skin.joints.length||weights[i+c]<0)throw Error('Invalid skin influence');sum+=weights[i+c];}if(Math.abs(sum-1)>.02)throw Error('Skin weights must sum to one');}}
  }}
  for(const child of n.children??[])visit(child);active.delete(id);
 };
 const scene=doc.scenes?.[doc.scene??0];if(!scene)throw Error('GLB has no default scene');for(const id of scene.nodes??[])visit(id);
 if(!primitives)throw Error('GLB scene has no renderable geometry');
 const clips=(doc.animations??[]).map((a:any)=>{let duration=0;for(const s of a.samplers??[]){const time=values[s.input];if(!time?.length||!values[s.output])throw Error('Animation sampler is incomplete');for(let i=0;i<time.length;i++)if(time[i]<0||i>0&&time[i]<=time[i-1])throw Error('Animation times must increase');duration=Math.max(duration,time.at(-1)!);}for(const c of a.channels??[])if(!nodes[c.target?.node]||!a.samplers[c.sampler])throw Error('Animation target is missing');return {name:a.name,duration};});
 let textureBytes=0;const warnings:string[]=[];
 for(const image of doc.images??[]){const v=views[image.bufferView];if(!v)throw Error('Texture image is not embedded');const meta=await sharp(bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength),{limitInputPixels:16777216}).metadata();if(!meta.width||!meta.height)throw Error('Invalid embedded image');textureBytes+=Math.ceil(meta.width*meta.height*4*4/3);if(Math.max(meta.width,meta.height)>2048)warnings.push(`Texture ${meta.width}×${meta.height} exceeds the 2048 review target`);}
 if(primitives>16)warnings.push(`${primitives} primitives: review draw-call cost`);
 if(bones.size>96)warnings.push(`${bones.size} bones: review skinning cost`);
 if(textureBytes>64*1024*1024+16)warnings.push('Decoded texture memory exceeds 64 MiB with mipmaps');
 return {doc,report:{sha256:hash(bytes),triangles,primitives,bones:bones.size,textures:(doc.images??[]).length,textureBytes,clips,materials:(doc.materials??[]).map((m:any)=>m.name??''),warnings}} satisfies {doc:Document;report:ModelQuality};
}
/** Hash-bound measurements; metadata checks rerun for every definition revision. */
export async function inspectGeometry(bytes:Buffer,asset:AssetDefinition,primary=true):Promise<ModelQuality>{
 const key=hash(bytes);let pending=cache.get(key);if(!pending){if(cache.size>=128)cache.delete(cache.keys().next().value!);pending=measure(bytes);cache.set(key,pending);pending.catch(()=>cache.delete(key));}
 const {report,doc}=await pending;
 const limit=MODEL_LIMITS[asset.kind as keyof typeof MODEL_LIMITS];if(limit&&report.triangles>limit)throw Error(`${asset.id}: ${report.triangles} triangles exceeds ${limit}`);
 if(primary){
  const names=new Set((doc.nodes??[]).map((n:any)=>n.name));
  for(const socket of asset.capabilities.sockets??[])if(!names.has(socket.node))throw Error(`Missing socket ${socket.node}`);
  for(const animation of asset.capabilities.animations??[]){const clip=report.clips.find(c=>c.name===animation.clip);if(!clip)throw Error(`Missing animation ${animation.clip}`);for(const event of animation.events)if(event.time>clip.duration+1e-5)throw Error(`Event ${event.name} lies outside ${animation.clip}`);}
  for(const slot of [...asset.materials.map(m=>m.slot),...asset.capabilities.teamColor?.slots??[]])if(!report.materials.includes(slot))throw Error(`Missing material ${slot}`);
  for(const binding of asset.bindings.render)if(binding.projectileSocket&&!names.has(binding.projectileSocket))throw Error(`Missing projectile socket ${binding.projectileSocket}`);
 }
 return structuredClone(report);
}

export function validateCompleteModel(asset:AssetDefinition,reports:readonly ModelQuality[]){
 const limit=MODEL_LIMITS[asset.kind as keyof typeof MODEL_LIMITS];if(!limit)return;
 const triangles=reports.reduce((sum,r)=>sum+r.triangles,0);
 if(triangles>limit)throw Error(`${asset.id}: body plus attachments totals ${triangles} triangles (limit ${limit})`);
}
