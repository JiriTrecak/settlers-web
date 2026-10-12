import {it,expect,vi} from 'vitest';
import {BoxGeometry,Box3,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,SkinnedMesh} from 'three';
import {StaticEffectBatch} from '../../src/render/abilities/staticEffectBatch';
import {visualEffectSchema,weaponProjectileLayers} from '../../src/content/effects/schema';
import {validateWeaponEffectGeometry} from '../../src/content/effects/limits';
import type {EffectModelSource} from '../../src/render/abilities/effectModel';
const effect=()=>visualEffectSchema.parse({schemaVersion:1,id:'effect.test.arrow',name:'Arrow',durationTicks:40,layers:[{id:'body',shape:'missile',model:{asset:'asset.test.arrow',role:'geometry',index:1,rotation:{x:0,y:0,z:0}},arcHeight:1,colour:'#ff0000',accent:'#ffffff',durationTicks:40,count:1,size:2,height:1,offset:{x:3,y:0,z:0}}]});
function source():EffectModelSource{const scene=new Group();scene.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial({color:'#ffffff'})));return {scene,animations:[],transform:{scale:2,pivot:[0,1,0],up:'Y',forward:'+Z'}};}
it('bakes authored source transforms and grows shared volley buffers without cloning models per shot',async()=>{
 const src=source(),original=src.scene.children[0] as Mesh,loader=vi.fn(async()=>src),batch=new StaticEffectBatch(effect().layers[0],loader);
 await batch.ready;const first=batch.root.children[0] as InstancedMesh,bufferDispose=vi.spyOn(first,'dispose'),material=first.material as MeshStandardMaterial;
 expect(new Box3().setFromBufferAttribute(first.geometry.attributes.position as any).min.y).toBe(-3);
 expect(material.color.g).toBe(0);expect((original.material as MeshStandardMaterial).color.g).toBe(1);
 batch.begin(200);for(let i=0;i<200;i++)batch.append(new Matrix4().makeTranslation(i,10,0));batch.flush();
 const mesh=batch.root.children[0] as InstancedMesh,matrix=new Matrix4();mesh.getMatrixAt(199,matrix);
 expect(mesh.count).toBe(200);expect(mesh.geometry).toBe(first.geometry);expect(mesh.material).toBe(first.material);expect(loader).toHaveBeenCalledTimes(1);expect(bufferDispose).toHaveBeenCalledTimes(1);
 expect(matrix.elements[0]).toBe(2);expect(matrix.elements[12]).toBe(202);expect(matrix.elements[13]).toBe(11);
 batch.begin(0);expect(mesh.count).toBe(0);expect(batch.root.visible).toBe(false);
 const geoDispose=vi.spyOn(mesh.geometry,'dispose'),ownDispose=vi.spyOn(material,'dispose'),sourceDispose=vi.spyOn(original.geometry,'dispose');batch.dispose();batch.dispose();
 expect(geoDispose).toHaveBeenCalledTimes(1);expect(ownDispose).toHaveBeenCalledTimes(1);expect(sourceDispose).toHaveBeenCalledTimes(1);
 batch.begin(1);batch.append(new Matrix4());expect(batch.root.children).toHaveLength(0);expect(batch.root.visible).toBe(false);
});
it('disposes late loads on cancellation and rejects oversized or skinned flight models without leaking sources',async()=>{
 const src=source(),mesh=src.scene.children[0] as Mesh,disposed=vi.spyOn(mesh.geometry,'dispose');let resolve!:(s:EffectModelSource)=>void;
 const batch=new StaticEffectBatch(effect().layers[0],()=>new Promise(r=>resolve=r));batch.dispose();resolve(src);await batch.ready;expect(disposed).toHaveBeenCalledTimes(1);expect(batch.root.children).toHaveLength(0);
 for(const type of ['heavy','skin']){const invalid=source();invalid.scene.clear();const mesh=type==='heavy'?new Mesh(new BoxGeometry(1,1,1,10,10,10),new MeshStandardMaterial()):new SkinnedMesh(new BoxGeometry(),new MeshStandardMaterial());invalid.scene.add(mesh);const dispose=vi.spyOn(mesh.geometry,'dispose');const bad=new StaticEffectBatch(effect().layers[0],async()=>invalid);await expect(bad.ready).rejects.toThrow(type==='heavy'?'512 triangles':'without skins');expect(dispose).toHaveBeenCalledTimes(1);expect(bad.root.children).toHaveLength(0);bad.dispose();expect(dispose).toHaveBeenCalledTimes(1);}
});
it('rejects unsupported weapon recipes and budgets the whole effect',()=>{
 expect(weaponProjectileLayers(effect())).toHaveLength(1);
 for(const change of [{loop:true},{layers:[]},{layers:[{...effect().layers[0],trail:{}}]},{layers:[{...effect().layers[0],count:5}]},{layers:[{...effect().layers[0],blend:'additive'}]}])expect(()=>weaponProjectileLayers({...effect(),...change} as any)).toThrow();
 const mixed=effect();mixed.layers.push({...mixed.layers[0],id:'extra',arcHeight:2});expect(()=>weaponProjectileLayers(mixed)).toThrow('share one flight arc');
 expect(()=>validateWeaponEffectGeometry([{triangles:300,primitives:1,bones:0},{triangles:300,primitives:1,bones:0}])).toThrow('512 triangles');
});
