import {it,expect} from 'vitest';
import {Group,Object3D,Vector3,Quaternion} from 'three';
import {resolveEffectSocket} from '../../src/render/abilities/effectSocket';
import {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {compilePackageRecords} from '../../tooling/asset-studio/server/authoring/packages';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
const sockets=[{name:'hand',node:'handBone',offset:[1,0,0] as [number,number,number]}];
const effect=(follow=true,fallback:'hide'|'origin'='hide')=>visualEffectSchema.parse({schemaVersion:1,id:'effect.test.hand',name:'Hand',durationTicks:80,layers:[{id:'light',shape:'light',colour:'#ffc050',accent:'#ffffff',durationTicks:80,count:1,size:2,height:0,follow,offset:{x:1,y:0,z:0},attachment:{socket:'hand',fallback,inheritRotation:true}}]});
it('resolves declared sockets through rotated and scaled hierarchy, including authored local offsets',()=>{
 const root=new Group(),bone=new Object3D();bone.name='handBone';bone.position.y=2;root.add(bone);root.position.set(4,1,8);root.scale.setScalar(2);root.rotation.y=Math.PI/2;
 const pose=resolveEffectSocket(root,sockets,'hand')!;expect(pose.position.distanceTo(new Vector3(4,5,6))).toBeLessThan(.00001);expect(new Vector3(1,0,0).applyQuaternion(pose.rotation).distanceTo(new Vector3(0,0,-1))).toBeLessThan(.00001);
 bone.position.y=3;expect(resolveEffectSocket(root,sockets,'hand')!.position.y).toBe(7);
 expect(resolveEffectSocket(root,sockets,'missing')).toBeUndefined();root.remove(bone);expect(resolveEffectSocket(root,sockets,'hand')).toBeUndefined();
});
it('follows attached poses, hides missing sockets, recovers on model load and cleans up',()=>{
 const player=new EffectPlayer(),doc=effect();let pose:{position:Vector3;rotation:Quaternion}|undefined;
 try{
  player.play(doc,{target:{x:7,y:8}});const root=player.root.children[0];player.update(1,undefined,undefined,()=>pose);expect(root.visible).toBe(false);
  pose={position:new Vector3(2,3,4),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2)};
  player.update(2,undefined,undefined,()=>pose);expect(root.visible).toBe(true);expect(root.position.distanceTo(new Vector3(2,3,3))).toBeLessThan(.00001);
  pose.position.x=6;player.update(3,undefined,undefined,()=>pose);expect(root.position.x).toBeCloseTo(6);
  pose=undefined;player.update(4,undefined,undefined,()=>pose);expect(root.visible).toBe(false);player.clear();expect(player.liveCues).toBe(0);
 }finally{player.dispose();}
});
it('snapshots non-following attachments and restores explicit origin fallback after socket loss',()=>{
 const player=new EffectPlayer(),pose={position:new Vector3(2,3,4),rotation:new Quaternion()};
 try{
  player.play(effect(false),{target:{x:7,y:8}});player.update(1,undefined,undefined,()=>pose);pose.position.x=20;player.update(2,undefined,undefined,()=>pose);expect(player.root.children[0].position.x).toBe(3);
  player.clear();player.play(effect(true,'origin'),{target:{x:7,y:8}});player.update(1,undefined,undefined,()=>pose);player.update(2,()=>({x:30,y:40,height:5}),undefined,()=>undefined);
  expect(player.root.children[0].position.toArray()).toEqual([31,5.035,40]);expect(player.root.children[0].quaternion.toArray()).toEqual([0,0,0,1]);
 }finally{player.dispose();}
});
it('compiles semantic socket metadata from the referenced geometry owner, without duplicate authored bindings',()=>{
 const model=assetDefinitionSchema.parse({version:1,id:'asset.test.model',name:'Model',kind:'unit',status:'published',revision:1,usesGeometry:true,resources:[{role:'geometry',index:1,format:'glb',bytes:20,sha256:'a'.repeat(64)}],capabilities:{sockets},bindings:{render:[{id:'asset.test.runtime',geometry:{asset:'asset.test.model',role:'geometry',index:1}}]},provenance:{method:'authored'}});
 const alias=assetDefinitionSchema.parse({version:1,id:'asset.test.alias',name:'Alias',kind:'data',status:'published',revision:1,usesGeometry:false,resources:[],bindings:{render:[{id:'asset.test.alias-runtime',geometry:{asset:model.id,role:'geometry',index:1}}]},provenance:{method:'authored'}});
 const records=compilePackageRecords([model,alias]);for(const r of records)expect(r.render[0].sockets).toEqual(sockets);
 expect(assetDefinitionSchema.safeParse({...model,bindings:{render:[{...model.bindings.render[0],sockets}]}}).success).toBe(false);
 const bad=effect();bad.layers[0].shape='missile';expect(visualEffectSchema.safeParse(bad).success).toBe(false);
});
