import {Mesh,Texture,TextureLoader} from 'three';
import {expect,it,vi} from 'vitest';
import {AnimationClip,Bone,BoxGeometry,Float32BufferAttribute,Frustum,Group,InstancedMesh,MeshStandardMaterial,Plane,Scene,Skeleton,SkinnedMesh,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SettlementLayer} from '../../src/render/settlement/settlementLayer';
import {HeightField} from '../../src/shared/map/height';
import {game,placed} from '../game/helpers';
// ENGINE-COUPLED: settlement presentation validates construction/shell effects against the global effect library
// (no injection point), so the test effects stand in for the shipped library.
vi.mock('../../src/content/effects/library',async importOriginal=>({...await importOriginal<object>(),coreEffects:(await import('../fixtures/content')).testEffects}));

it('camera-only visibility changes restore baked unit draws without an editor edit or simulation tick',async()=>{
 const g=game([placed('test-warrior','unit.test.warrior',205,210)]),unitFile=g.registry.asset(g.registry.get('unit.test.warrior').asset).file!;
 // The unit's model is a skinned character; every other model (effects, props) is a static mesh.
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async(url)=>{
  if(!String(url).includes(unitFile.replace(/^assets\//,''))){const scene=new Group();scene.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));return {scene,animations:[]} as any;}
  const scene=new Group(),bone=new Bone();bone.name='root';
  const geometry=new BoxGeometry(1,1,1),count=geometry.attributes.position!.count;
  geometry.setAttribute('skinIndex',new Float32BufferAttribute(new Float32Array(count*4),4));
  geometry.setAttribute('skinWeight',new Float32BufferAttribute(Float32Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
  const mesh=new SkinnedMesh(geometry,new MeshStandardMaterial());scene.add(bone,mesh);scene.updateMatrixWorld(true);mesh.bind(new Skeleton([bone]));
  scene.userData.characterProfile={variants:{base:{states:{idle:'idle'}}},attackEvents:{}};
  return {scene,animations:[new AnimationClip('idle',1,[])]} as any;
 });
 vi.spyOn(TextureLoader.prototype,'load').mockImplementation((_url,onLoad)=>{const texture=new Texture({width:64,height:64} as HTMLImageElement);queueMicrotask(()=>onLoad?.(texture));return texture;});
 const scene=new Scene(),layer=new SettlementLayer(scene,g.registry);
 try{
  const view=g.view(),state={...view,entities:view.entities.filter(e=>e.definition==='unit.test.warrior')};
  const far=new Frustum(...[new Vector3(1,0,0),new Vector3(-1,0,0),new Vector3(0,1,0),new Vector3(0,-1,0),new Vector3(0,0,1),new Vector3(0,0,-1)].map(n=>new Plane(n,10)));
  layer.setViewFrustum(far);layer.update(state,new HeightField(),0);await layer.ready;layer.update(state,new HeightField(),0);
  const batches:InstancedMesh[]=[];scene.getObjectByName('baked-units')!.traverse(o=>{if(o instanceof InstancedMesh&&!o.name.endsWith('shadow'))batches.push(o);});
  expect(batches.length).toBeGreaterThan(0);expect(batches.every(b=>b.count===0&&!b.visible)).toBe(true);
  layer.setViewFrustum(null); // Free/follow camera now reaches the previously frozen unit.
  expect(batches.every(b=>b.count>0&&b.visible)).toBe(true);
 }finally{layer.destroy(scene);vi.restoreAllMocks();}
});
