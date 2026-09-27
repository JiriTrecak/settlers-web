import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
const folder='assets/library/asset.models.units.ants-worker';
const bytes=readFileSync(folder+'/geometry.glb'),length=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);
const manifest=JSON.parse(readFileSync('art/assets/asset.models.units.ants-worker/asset.json','utf8'));
function accessor(id:number){
 const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],n=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16} as any)[a.type];
 const size=({5121:1,5123:2,5125:4,5126:4} as any)[a.componentType],data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 const get=(o:number)=>a.componentType===5126?data.getFloat32(o,true):a.componentType===5125?data.getUint32(o,true):a.componentType===5123?data.getUint16(o,true):data.getUint8(o);
 return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>{const x=get((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??n*size)+j*size);return a.normalized?x/(a.componentType===5121?255:65535):x;}));
}
const primitives=gltf.meshes.flatMap((m:any)=>m.primitives);
describe('published worker',()=>{
 it('includes the tool and all cargo alternatives in the complete-unit budget',()=>{
  expect(bytes.equals(readFileSync('art/assets/asset.models.units.ants-worker/geometry.glb'))).toBe(true);
  const body=primitives.reduce((n:number,p:any)=>n+gltf.accessors[p.indices].count/3,0);expect(body).toBeGreaterThan(3000);
  for(const item of ['wood','amber','root']){
   const binding=manifest.bindings.render.find((r:any)=>r.id===`asset.item.${item}`);expect(binding).toBeDefined();
   const cargo=readFileSync(`${folder}/geometry_${binding.geometry.index}.glb`),n=cargo.readUInt32LE(12),j=JSON.parse(cargo.subarray(20,20+n).toString());
   const count=j.meshes.flatMap((m:any)=>m.primitives).reduce((s:number,p:any)=>s+j.accessors[p.indices].count/3,0);
   expect(count).toBeGreaterThan(50);expect(body+count).toBeLessThanOrEqual(5000);
  }
 });
 it('retains normalized skin weights, the backpack socket and real work/carry motions',()=>{
  expect(gltf.skins[0].joints.length).toBeGreaterThanOrEqual(68);
  expect(gltf.nodes.some((n:any)=>n.name==='socket_back')).toBe(true);
  for(const p of primitives){
   expect(p.attributes.JOINTS_0).toBeDefined();
   for(const weights of accessor(p.attributes.WEIGHTS_0))expect(weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1,4);
  }
  const profile=gltf.nodes.find((n:any)=>n.extras?.characterProfile).extras.characterProfile;
  for(const state of ['idle','walk','run','build','chop','carry','carry_walk','carry_run','attack','hit','death']){
   const clip=gltf.animations.find((a:any)=>a.name===profile.variants.base.states[state]);expect(clip).toBeDefined();expect(clip.channels.length).toBeGreaterThan(50);
   for(const sampler of clip.samplers){expect(gltf.accessors[sampler.input].count).toBeGreaterThan(1);for(const values of accessor(sampler.output))for(const v of values)expect(Number.isFinite(v)).toBe(true);}
  }
  expect(profile.variants.base.states.carry_walk).not.toBe(profile.variants.base.states.walk);
 });
 it('has opaque leaf ownership while retaining natural chitin, eyes and timber',async()=>{
  const m=gltf.materials.find((m:any)=>m.name==='TC_TeamColor');expect(m.extras.teamColorMask).toBe('baseColorAlpha');expect(m.alphaMode??'OPAQUE').toBe('OPAQUE');
  expect(m.normalTexture).toBeDefined();expect(m.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
  const image=gltf.images[gltf.textures[m.pbrMetallicRoughness.baseColorTexture.index].source],v=gltf.bufferViews[image.bufferView];
  const {data,info}=await sharp(bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  expect(Math.max(info.width,info.height)).toBeLessThanOrEqual(2048);
  let mask=0,orange=0,orangeMasked=0;
  for(let i=0;i<data.length;i+=4){if(data[i+3]>200)mask++;if(data[i]>data[i+1]*1.5&&data[i+1]>data[i+2]*1.25&&data[i]>80){orange++;if(data[i+3]>60)orangeMasked++;}}
  expect(mask).toBeGreaterThan(1000);expect(mask/(info.width*info.height)).toBeLessThan(.2);expect(orange).toBeGreaterThan(1000);expect(orangeMasked/orange).toBeLessThan(.005);
 });
});
