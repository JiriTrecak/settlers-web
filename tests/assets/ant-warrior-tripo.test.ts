import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const bytes=readFileSync('art/sources/characters/ant-warrior-tripo/warrior.glb');
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const bin=bytes.subarray(28+jsonLength);
function accessor(id:number){
 const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView];
 const n=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16} as Record<string,number>)[a.type];
 const size=({5121:1,5123:2,5125:4,5126:4} as Record<number,number>)[a.componentType];
 const data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 const get=(o:number)=>a.componentType===5126?data.getFloat32(o,true):a.componentType===5125?data.getUint32(o,true):a.componentType===5123?data.getUint16(o,true):data.getUint8(o);
 return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>{
  const val=get((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??n*size)+j*size);
  return a.normalized?val/(a.componentType===5121?255:65535):val;
 }));
}
const primitives=gltf.meshes.flatMap((m:any)=>m.primitives);
describe('Tripo warrior experiment export',()=>{
 it('keeps the 5k budget, real rig, textures and nonempty motion clips',()=>{
  expect(primitives.reduce((n:number,p:any)=>n+gltf.accessors[p.indices].count/3,0)).toBeLessThan(5000);
  expect(gltf.skins[0].joints).toHaveLength(69);
  expect(gltf.images.length).toBeGreaterThanOrEqual(7);
  for(const name of ['idle','walk','run','hit','death','attack_sword']){
   const a=gltf.animations.find((a:any)=>a.name===name);expect(a).toBeDefined();expect(a.channels.length).toBeGreaterThan(50);
   for(const s of a.samplers){expect(gltf.accessors[s.input].count).toBeGreaterThan(1);for(const row of accessor(s.output))for(const v of row)expect(Number.isFinite(v)).toBe(true);}
  }
  const attack=gltf.animations.find((a:any)=>a.name==='attack_sword');
  expect(Math.max(...attack.samplers.map((s:any)=>gltf.accessors[s.input].max[0]))).toBeLessThan(3.1);
 });
 it('binds rigid gear to hands instead of blended finger weights',()=>{
  for(const [part,bone] of [[2,'mixamorig:LeftHand'],[3,'mixamorig:RightHand'],[6,'mixamorig:RightHand']] as const){
   const p=primitives.find((p:any)=>gltf.materials[p.material].name===`tripo_part_${part}_material`);
   const joints=accessor(p.attributes.JOINTS_0),weights=accessor(p.attributes.WEIGHTS_0);
   weights.forEach((w:number[],i:number)=>{expect(w.reduce((a,b)=>a+b,0)).toBeCloseTo(1,5);expect(Math.max(...w)).toBeCloseTo(1,5);
    const index=w.indexOf(Math.max(...w));expect(gltf.nodes[gltf.skins[0].joints[joints[i][index]]].name).toBe(bone);
   });
  }
 });
 it('preserves natural texture colors when joining team-colored parts',()=>{
  expect(gltf.materials.some((m:any)=>m.name==='TC_TeamColor')).toBe(true);
  for(const p of primitives){
   const colors=accessor(p.attributes.COLOR_0);
   const isTeam=gltf.materials[p.material].name==='TC_TeamColor';
   for(const c of colors){
    if(isTeam){expect(c[0]).toBeCloseTo(c[1],4);expect(c[1]).toBeCloseTo(c[2],4);expect(c[0]).toBeGreaterThan(.05);}
    else for(const v of c.slice(0,3))expect(v).toBeCloseTo(1,4);
   }
  }
 });
});
