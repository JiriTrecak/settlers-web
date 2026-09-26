import {readFileSync} from 'node:fs';
import {beforeAll,describe,expect,it} from 'vitest';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {DataTexture,RGBAFormat,SkinnedMesh,MeshStandardMaterial,Vector3} from 'three';
import sharp from 'sharp';
import {createCharacterInstance} from '../../src/render/characters/character-player.js';
import {content} from '../../src/content/builtin';
const file='assets/library/asset.models.units.ants-warrior/geometry.glb';
const bytes=readFileSync(file),jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const bin=bytes.subarray(28+jsonLength);
let gltf:GLTF;
beforeAll(async()=>{
 // Decode the real embedded textures in Node; browser/WebGL rendering is checked in Combat Lab.
 const loader=new GLTFLoader().register(parser=>({name:'NodeEmbeddedTextures',async loadTexture(index:number){
  const source=parser.json.images[parser.json.textures[index].source],view=parser.json.bufferViews[source.bufferView];
  const {data,info}=await sharp(bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const texture=new DataTexture(new Uint8Array(data),info.width,info.height,RGBAFormat);texture.flipY=false;return texture;
 }}));
 gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
});
describe('Published Tripo ant warrior',()=>{
 it('publishes the approved source with textures, sockets and the enforced triangle budget',()=>{
  expect(bytes.equals(readFileSync('art/sources/characters/ant-warrior-tripo/warrior.glb'))).toBe(true);
  const asset=content.asset(content.get('unit.ants.warrior').asset);
  expect(asset.file).toBe(file);expect(asset.character).toBe('warrior');
  const tris=json.meshes.flatMap((m:any)=>m.primitives).reduce((sum:number,p:any)=>sum+json.accessors[p.indices].count/3,0);
  expect(tris).toBeGreaterThan(2500);expect(tris).toBeLessThan(5000);expect(json.images).toHaveLength(7);
  let skinned=0,textured=0;gltf.scene.traverse(o=>{if(!(o instanceof SkinnedMesh))return;skinned++;
   expect(o.skeleton.bones.length).toBe(69);
   for(const m of Array.isArray(o.material)?o.material:[o.material])if((m as MeshStandardMaterial).map)textured++;
   const weight=o.geometry.getAttribute('skinWeight');
   for(let i=0;i<weight.count;i++)expect(weight.getX(i)+weight.getY(i)+weight.getZ(i)+weight.getW(i)).toBeCloseTo(1,4);
  });expect(skinned).toBeGreaterThan(0);expect(textured).toBe(7);
  for(const name of ['socket_handL','socket_handR','socket_blade_tip','socket_blade_base'])expect(gltf.scene.getObjectByName(name)).toBeDefined();
 });
 it('isolates player colors and skeleton poses while sharing textures',()=>{
  const a=createCharacterInstance(gltf,'warrior'),b=createCharacterInstance(gltf,'warrior');
  const materials=(root:any)=>{const out:MeshStandardMaterial[]=[];root.traverse((o:any)=>{if(o.isMesh)out.push(...(Array.isArray(o.material)?o.material:[o.material]))});return out};
  const am=materials(a.root),bm=materials(b.root),natural=am.filter(m=>m.name!=='TC_TeamColor').map(m=>m.color.clone());
  a.player.setTeamColor('#cb3030');b.player.setTeamColor('#286bdb');
  expect(am.find(m=>m.name==='TC_TeamColor')!.color.equals(bm.find(m=>m.name==='TC_TeamColor')!.color)).toBe(false);
  am.filter(m=>m.name!=='TC_TeamColor').forEach((m,i)=>expect(m.color.equals(natural[i])).toBe(true));
  am.forEach((m,i)=>expect(m.map).toBe(bm[i].map));
  const name='mixamorigSpine',bone=b.root.getObjectByName(name)!,before=bone.quaternion.clone();
  a.player.setState('attack');a.player.seek(.5);
  expect(bone.quaternion.equals(before)).toBe(true);expect(a.root.getObjectByName(name)!.quaternion.equals(before)).toBe(false);
  a.dispose();b.player.update(.1);b.dispose();
 });
 it('supports locomotion and charge, and moves blade sockets rigidly with the sword',()=>{
  const a=createCharacterInstance(gltf,'warrior');
  for(const state of ['idle','walk','run','charge'] as const){a.player.setState(state);a.player.update(.1);expect(a.player.action.getClip().tracks.length).toBeGreaterThan(50);}
  expect(a.player.hasState('carry')).toBe(false);
  a.player.setState('attack');
  const tip=a.root.getObjectByName('socket_blade_tip')!,base=a.root.getObjectByName('socket_blade_base')!;
  const poses=[.15,.49,.8].map(t=>{a.player.seek(t);a.root.updateMatrixWorld(true);return {tip:tip.getWorldPosition(new Vector3()),base:base.getWorldPosition(new Vector3())};});
  expect(poses[0].tip.distanceTo(poses[1].tip)).toBeGreaterThan(.2);
  const length=poses[0].tip.distanceTo(poses[0].base);expect(length).toBeGreaterThan(.3);
  poses.forEach(p=>expect(p.tip.distanceTo(p.base)).toBeCloseTo(length,4));
  expect(a.player.attackContact()).toBeCloseTo(35/71,6);a.dispose();
 });
 it('fires one visual impact at the mapped contact and clamps death',()=>{
  const a=createCharacterInstance(gltf,'warrior'),events:string[]=[];a.player.onEvent=e=>events.push(e.type);
  a.player.setState('attack');const contactSeconds=a.player.action.getClip().duration*a.player.attackContact()/a.player.speed;
  a.player.update(contactSeconds-.01);expect(events).toEqual([]);a.player.update(.02);expect(events).toEqual(['hit']);
  a.player.update(2);expect(events).toEqual(['hit']);expect(a.player.state).toBe('idle');
  a.player.setState('death');a.player.update(5);expect(a.player.state).toBe('death');expect(a.player.action.paused).toBe(true);a.dispose();
 });
 it('safely tolerates dialogue without pretending this rig has facial animation',()=>{
  const a=createCharacterInstance(gltf,'warrior');expect(a.root.getObjectByName('jaw')).toBeUndefined();
  expect(()=>{a.player.speak(1);a.player.speak(0);}).not.toThrow();a.dispose();
 });
});
