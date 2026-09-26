import './sourceAssetFetch';
import {afterEach,expect,it,vi} from 'vitest';
import {AnimationClip,Group,Scene} from 'three';
import {ContentRegistry} from '../../src/content/registry';
import type {Rules} from '../../src/content/schema';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SettlementLayer} from '../../src/render/settlement/settlementLayer';
import {HeightField} from '../../src/shared/map/height';
import {game,placed,source} from '../game/helpers';
afterEach(()=>vi.restoreAllMocks());
it('updates cached model decorations without recursive name searches and refreshes them on asset replacement',async()=>{
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:new Group(),animations:[]} as any);
 const scene=new Scene(),layer=new SettlementLayer(scene);await layer.ready;
 const g=game([placed('building','building.ants.house',205,210)]),view=g.view();
 const entity=view.entities.find(e=>e.definition==='building.ants.house')!;
 const state={...view,entities:[entity]},field=new HeightField();
 layer.update(state,field,0);
 const root=scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===entity.id)!;
 const health=root.getObjectByName('Health')!,selection=root.getObjectByName('Selection')!;
 const lookup=vi.spyOn(root,'getObjectByName');layer.select([entity.id]);
 for(let i=1;i<=60;i++)layer.update(state,field,i);
 expect(lookup).not.toHaveBeenCalled();expect(health.visible).toBe(true);expect(selection.visible).toBe(true);
 layer.update({...state,entities:[{...entity,appearance:{asset:'asset.ants.forester'}}]},field,61);
 const replacement=scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===entity.id)!;
 expect(replacement).not.toBe(root);expect(replacement.getObjectByName('Selection')!.visible).toBe(true);
 layer.destroy(scene);
});

it.each([1,1.7,2])('renders unit bodies and indicators at the shared rules scale %s without scaling buildings or world positions',async(scale)=>{
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>{
  const scene=new Group();scene.userData.characterProfile={variants:{warrior:{states:{idle:'idle'}},base:{states:{idle:'idle'}}},attackEvents:{}};
  return {scene,animations:[new AnimationClip('idle',1,[])]} as any;
 });
 const raw=source();(raw.rules as Rules).unitScale=scale;
 const registry=new ContentRegistry(raw),scene=new Scene(),layer=new SettlementLayer(scene,undefined,registry);await layer.ready;
 const definitions=['unit.ants.warrior','unit.ants.settler','building.ants.house'];
 const g=game(definitions.map((d,i)=>placed('size.'+i,d,205+i*5,210)),draft=>{(draft.rules as Rules).unitScale=scale;}),view=g.view();
 const state={...view,entities:view.entities.filter(e=>definitions.includes(e.definition))},field=new HeightField();
 layer.update(state,field,0);
 const roots=state.entities.map(e=>scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===e.id)!);
 for(let tick=1;tick<=5;tick++)layer.update(state,field,tick);
 state.entities.forEach((e,i)=>{
  const root=scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===e.id)!;
  expect(root).toBe(roots[i]);
  const asset=registry.asset(registry.get(e.definition).asset),unit=!!e.unit,multiplier=unit?scale:1;
  const body=root.getObjectByName('Body')!;
  expect(body.scale.x).toBeCloseTo((asset.scale??1)*multiplier);
  expect(body.scale.y).toBeCloseTo(body.scale.x);expect(body.scale.z).toBeCloseTo(body.scale.x);
  expect(root.getObjectByName('Health')!.position.y).toBeCloseTo((asset.healthHeight??2.5)*multiplier);
  expect(root.position.x).toBe(e.x);expect(root.position.z).toBe(e.y);expect(root.scale.x).toBe(1);
  if(unit){
   expect(root.getObjectByName('Cargo')!.position.y).toBeCloseTo(1.04*scale);
   expect(root.getObjectByName('Selection')!.scale.x).toBeCloseTo(1.8*scale);
   expect(layer.cameraSubject(e.id)!.eyeHeight).toBeGreaterThan(scale);
  }
 });
 layer.destroy(scene);
});
