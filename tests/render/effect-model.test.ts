import {expect,it,vi} from 'vitest';
import {AnimationClip,BoxGeometry,Group,Mesh,MeshStandardMaterial,NumberKeyframeTrack,PointLight,InstancedMesh,Bone,Skeleton,SkinnedMesh} from 'three';
import {EffectModels,type EffectModelSource} from '../../src/render/abilities/effectModel';
import {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import {visualEffectSchema} from '../../src/content/effects/schema';
const ref={asset:'asset.test.mesh',role:'geometry' as const,index:1,rotation:{x:0,y:0,z:0}};
function source():EffectModelSource{
 const scene=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshStandardMaterial({color:'#80ffff'}));mesh.name='body';scene.add(mesh,new PointLight());
 return {scene,animations:[new AnimationClip('rise',1,[new NumberKeyframeTrack('body.position[y]',[0,1],[0,4])])],transform:{scale:2,pivot:[0,1,0],up:'Y',forward:'+Z'}};
}
const body=(handle:{root:Group})=>handle.root.getObjectByName('body') as Mesh<any,MeshStandardMaterial>;
it('shares source geometry but owns materials, pose and animation clocks; samples identically after rewind',async()=>{
 const src=source(),loader=vi.fn(async()=>src),pool=new EffectModels(loader);
 try{
  const a=pool.create({...ref,animation:{clip:'rise',speed:1,loop:true}})!,b=pool.create(ref)!;
  a.sample(20,.5,'#ff0000');await pool.ready();
  expect(loader).toHaveBeenCalledTimes(1);expect(body(a).geometry).toBe(body(b).geometry);expect(body(a).material).not.toBe(body(b).material);
  expect(body(a).position.y).toBeCloseTo(2);expect(body(b).position.y).toBe(0);expect(body(a).material.opacity).toBe(.5);expect(body(b).material.opacity).toBe(1);
  expect(body(a).material.color.g).toBe(0);expect(body(b).material.color.g).toBe(1);
  expect(body(a).getWorldPosition(body(a).position.clone()).y).toBeCloseTo(2); // (2 - authored pivot 1) * scale 2
  const visibleLights:any[]=[];a.root.traverse(o=>{if(o instanceof PointLight)visibleLights.push(o);});expect(visibleLights).toHaveLength(0);
  a.sample(31,1,'#ffffff');a.sample(20,.5,'#ff0000');expect(body(a).position.y).toBeCloseTo(2);
  a.sample(60,1,'#ffffff');expect(body(a).position.y).toBeCloseTo(2);
  a.dispose();expect(body(b).material.opacity).toBe(1);expect(body(b).geometry.attributes.position.count).toBeGreaterThan(0);
 }finally{pool.dispose();}
});
it('clamps one-shot clips and can seek backward after the endpoint',async()=>{
 const pool=new EffectModels(async()=>source());try{const h=pool.create({...ref,animation:{clip:'rise',speed:2,loop:false}})!;await pool.ready();h.sample(100,1,'#ffffff');expect(body(h).position.y).toBe(4);h.sample(5,1,'#ffffff');expect(body(h).position.y).toBe(1);}finally{pool.dispose();}
});
it('clones animated skeletons independently for simultaneous instances',async()=>{
 const scene=new Group(),bone=new Bone(),mesh=new SkinnedMesh(new BoxGeometry(),new MeshStandardMaterial());bone.name='joint';mesh.add(bone);mesh.bind(new Skeleton([bone]));scene.add(mesh);
 const pool=new EffectModels(async()=>({scene,animations:[new AnimationClip('bend',1,[new NumberKeyframeTrack('joint.rotation[z]',[0,1],[0,1])])],transform:source().transform}));
 try{const a=pool.create({...ref,animation:{clip:'bend',speed:1,loop:false}})!,b=pool.create({...ref,animation:{clip:'bend',speed:1,loop:false}})!;await pool.ready();a.sample(20,1,'#ffffff');b.sample(10,1,'#ffffff');expect(a.root.getObjectByName('joint')!.rotation.z).toBe(.5);expect(b.root.getObjectByName('joint')!.rotation.z).toBe(.25);expect(bone.rotation.z).toBe(0);a.dispose();b.sample(30,1,'#ffffff');expect(b.root.getObjectByName('joint')!.rotation.z).toBe(.75);}finally{pool.dispose();}
});
it('does not attach late loads after cancellation; releases cached resources exactly once on close',async()=>{
 const src=source(),mesh=src.scene.children[0] as Mesh,geometry=vi.spyOn(mesh.geometry,'dispose'),material=vi.spyOn(mesh.material as MeshStandardMaterial,'dispose');
 let finish!:(s:EffectModelSource)=>void;const pool=new EffectModels(()=>new Promise(resolve=>finish=resolve)),h=pool.create(ref)!;
 h.dispose();pool.dispose();finish(src);await h.ready;expect(h.root.children).toHaveLength(0);expect(geometry).toHaveBeenCalledTimes(1);expect(material).toHaveBeenCalledTimes(1);
});
it('reports bad clips instead of producing a successful blank capture',async()=>{
 const pool=new EffectModels(async()=>source());try{const h=pool.create({...ref,animation:{clip:'missing',speed:1,loop:true}})!;await expect(pool.ready()).rejects.toThrow('clip is missing');expect(h.root.visible).toBe(false);h.dispose();await expect(pool.ready()).resolves.toBeUndefined();}finally{pool.dispose();}
});
it('unblocks a waiting capture when its model is canceled, and retries a previously failed model',async()=>{
 let reject!:(error:Error)=>void;
 const loader=vi.fn(()=>new Promise<EffectModelSource>((_resolve,fail)=>reject=fail)),pool=new EffectModels(loader),first=pool.create(ref)!;
 const waiting=pool.ready();first.dispose();await waiting;reject(Error('Temporary failure'));await Promise.resolve();await Promise.resolve();await Promise.resolve();
 loader.mockImplementation(async()=>source());const retry=pool.create(ref)!;await pool.ready();expect(loader).toHaveBeenCalledTimes(2);expect(body(retry)).toBeDefined();pool.dispose();
});
it('bounds mesh instances, counts instancing in triangle cost, and recovers capacity after stop',async()=>{
 const pool=new EffectModels(async()=>source());try{const handles=Array.from({length:16},()=>pool.create(ref)!);expect(pool.create(ref)).toBeUndefined();await pool.ready();handles[0].dispose();expect(pool.create(ref)).toBeDefined();}finally{pool.dispose();}
 const heavy=source();heavy.scene.clear();heavy.scene.add(new InstancedMesh(new BoxGeometry(),new MeshStandardMaterial(),834));
 const limited=new EffectModels(async()=>heavy);try{limited.create(ref);await expect(limited.ready()).rejects.toThrow('10,000 triangles');}finally{limited.dispose();}
});
it('integrates mesh layers with authored placement, lifetime and clear without simulation entities',async()=>{
 const pool=new EffectModels(async()=>source()),player=new EffectPlayer(pool);
 const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.mesh',name:'Mesh',durationTicks:60,layers:[{id:'mesh',shape:'mesh',model:ref,colour:'#ffffff',accent:'#ffffff',durationTicks:60,count:1,size:.5,height:2}]});
 try{player.play(effect,{target:{x:10,y:12}});player.update(15);await player.ready();expect(player.root.children[0].position.x).toBe(10);expect(player.root.children[0].children[0].scale.x).toBe(.5);expect(player.root.children[0].children[0].position.y).toBe(2);player.update(61);expect(player.liveCues).toBe(0);await player.ready();}finally{player.dispose();}
});
