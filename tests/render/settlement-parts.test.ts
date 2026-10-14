import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {Texture,TextureLoader,AnimationClip,Group,Scene,Mesh,BoxGeometry,MeshStandardMaterial,Box3,Vector3} from 'three';
import {RallyMarkers} from '../../src/render/settlement/rallyMarkers';
import {MineLabels} from '../../src/render/settlement/mineLabels';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition} from '../../src/content/schema';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SettlementLayer} from '../../src/render/settlement/settlementLayer';
import {HeightField} from '../../src/shared/map/height';
import {content} from '../../src/content/builtin';
import type {ContentSource} from '../../src/content/registry';
import {game,placed,source} from '../game/helpers';
/** ENGINE-COUPLED: SettlementLayer validates construction dust, projectile and shell-impact effects against the shipped
 * effect library (coreEffects) with no injection point. The layer therefore receives the test world with those effect
 * references pointed at whatever the shipped content currently uses; every entity, asset and scale stays test-owned. */
function layerRegistry(raw:ContentSource=source()){
 const world=raw as unknown as {rules:{races:Record<string,{construction?:{dustEffect:string}}>};assets:{projectile?:string;impactEffect?:string}[]};
 const dust=Object.values(content.rules.races).find(r=>r.construction)!.construction!.dustEffect;
 const projectile=content.assets.find(a=>a.projectile)!.projectile,impact=content.assets.find(a=>a.impactEffect)!.impactEffect;
 for(const race of Object.values(world.rules.races))if(race.construction)race.construction.dustEffect=dust;
 for(const asset of world.assets){if(asset.projectile)asset.projectile=projectile;if(asset.impactEffect)asset.impactEffect=impact;}
 return new ContentRegistry(raw);
}
// The shared renderer also loads declared weapon effects; a GLTF fixture must
// contain geometry to satisfy the same model contract as production assets.
function modelFixture(){const scene=new Group();scene.add(new Mesh(new BoxGeometry(1,1,1),new MeshStandardMaterial()));return scene;}
// These tests exercise scene lifecycle; browser image decoding is covered separately.
beforeEach(()=>vi.spyOn(TextureLoader.prototype,'load').mockImplementation((_url,onLoad)=>{const texture=new Texture({width:1,height:1} as HTMLImageElement);queueMicrotask(()=>onLoad?.(texture));return texture;}));
afterEach(()=>vi.restoreAllMocks());
it('uses a grounded scaffold in the shared renderer and reveals the full-sized building before completion',async()=>{
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>{const scene=new Group(),mesh=new Mesh(new BoxGeometry(1,1,1),new MeshStandardMaterial());mesh.position.y=.5;scene.add(mesh);return {scene,animations:[]} as any;});
 const scene=new Scene(),g=game([placed('scaffold-test','building.test.house',205,210)]),layer=new SettlementLayer(scene,layerRegistry()),view=g.view();
 const e=view.entities.find(e=>e.definition==='building.test.house')!,field=new HeightField();
 const total=g.registry.get(e.definition).creation!.workTicks;
 const state={...view,entities:[{...e,construction:{progress:Math.floor(total*.5)}}]};
 for(let i=0;i<3;i++){layer.update(state,field,0);await layer.ready;}
 const root=scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===e.id)!,body=root.getObjectByName('Body')!,scaffold=root.getObjectByName('Construction scaffold')!;
 expect(scaffold.visible).toBe(true);expect(body.visible).toBe(false);expect(body.scale.y).toBe(body.scale.x);
 scene.updateMatrixWorld(true);
 expect(new Box3().setFromObject(scaffold).getCenter(new Vector3()).x).toBeCloseTo(e.x);
 const progressed={...state,entities:[{...e,construction:{progress:Math.ceil(total*.96)}}]};
 layer.update(progressed,field,1);expect(body.visible).toBe(true);expect(scaffold.scale.y).toBe(1);expect(scaffold.position.y).toBeLessThan(0);
 layer.update({...view,entities:[e]},field,2);expect(root.getObjectByName('Construction scaffold')).toBeUndefined();expect(body.visible).toBe(true);
 layer.update(state,field,3);expect(root.getObjectByName('Construction scaffold')).toBeDefined();expect(body.visible).toBe(false);
 layer.update({...view,entities:[]},field,4);expect(root.parent).toBeNull();layer.destroy(scene);
});
it('keeps health and selection decorations on the entity and refreshes them on asset replacement',async()=>{
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:modelFixture(),animations:[]} as any);
 const g=game([placed('building','building.test.house',205,210)]),view=g.view();
 const scene=new Scene(),layer=new SettlementLayer(scene,layerRegistry());await layer.ready;
 const entity=view.entities.find(e=>e.definition==='building.test.house')!;
 const state={...view,entities:[entity]},field=new HeightField();
 layer.update(state,field,0);await layer.ready;layer.update(state,field,0);
 const root=scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===entity.id)!;
 const health=root.getObjectByName('Health')!,circles=scene.getObjectByName('selection-circles')!;
 const circleFor=()=>circles.children.filter(o=>o.userData.entityId===entity.id);
 layer.select([entity.id]);
 for(let i=1;i<=60;i++)layer.update(state,field,i);
 expect(health.visible).toBe(true);expect(circleFor()).toHaveLength(1);
 const changed={...state,entities:[{...entity,appearance:{asset:'asset.test.forester'}}]};layer.update(changed,field,61);await layer.ready;layer.update(changed,field,61);
 const replacement=scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===entity.id)!;
 expect(replacement).not.toBe(root);expect(circleFor()).toHaveLength(1);
 layer.select([]);layer.update(changed,field,62);expect(circleFor()).toHaveLength(0);
 layer.destroy(scene);
});

it.each([1,1.7,2])('renders unit bodies and indicators at the definition model scale %s independently of building presentation scales and world positions',async(scale)=>{
 vi.spyOn(MineLabels.prototype,'update').mockImplementation(()=>{});
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>{
  const scene=modelFixture();scene.userData.characterProfile={variants:{warrior:{states:{idle:'idle'}},base:{states:{idle:'idle'}}},attackEvents:{}};
  return {scene,animations:[new AnimationClip('idle',1,[])]} as any;
 });
 const raw=source();(raw.definitions as AuthoredDefinition[]).filter(d=>d.kind==='unit').forEach(d=>d.modelScale=scale);
 const registry=layerRegistry(raw),scene=new Scene(),layer=new SettlementLayer(scene,registry);await layer.ready;
 const definitions=['unit.test.warrior','unit.test.settler','building.test.house','building.test.neutral-amber-mine'];
 const g=game(definitions.map((d,i)=>({...placed('size.'+i,d,205+i*5,210),owner:d==='building.test.neutral-amber-mine'?'none' as const:'player.1' as const})),draft=>{(draft.definitions as AuthoredDefinition[]).filter(d=>d.kind==='unit').forEach(d=>d.modelScale=scale);}),view=g.view();
 const state={...view,entities:view.entities.filter(e=>definitions.includes(e.definition))},field=new HeightField();
 layer.update(state,field,0);await layer.ready;layer.update(state,field,0);
 const roots=state.entities.map(e=>scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===e.id)!);
 for(let tick=1;tick<=5;tick++)layer.update(state,field,tick);
 state.entities.forEach((e,i)=>{
  const root=scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===e.id)!;
  expect(root).toBe(roots[i]);
  const asset=registry.asset(registry.get(e.definition).asset),unit=!!e.unit,multiplier=registry.get(e.definition).modelScale??1;
  const body=root.getObjectByName('Body')!;
  expect(body.scale.x).toBeCloseTo((asset.scale??1)*multiplier);
  expect(body.scale.y).toBeCloseTo(body.scale.x);expect(body.scale.z).toBeCloseTo(body.scale.x);
  expect(root.getObjectByName('Health')!.position.y).toBeCloseTo((registry.get(e.definition).dimensions?.height??(asset.healthHeight??2.5)*multiplier)+.25);
  if(e.gathering)expect(root.getObjectByName('Mine occupancy')).toBeUndefined();
  expect(root.position.x).toBe(e.x);expect(root.position.z).toBe(e.y);expect(root.scale.x).toBe(1);
  if(unit){
   expect(root.getObjectByName('Cargo')!.position.y).toBeCloseTo(1.04*scale);
   const dims=registry.get(e.definition).dimensions;
   expect(root.userData.circleRadius).toBeCloseTo(dims?Math.max(dims.radius+.32,dims.formationSpacing*.45):.9*scale);
   expect(layer.cameraSubject(e.id)!.eyeHeight).toBeGreaterThan(scale);
  }
 });
 layer.destroy(scene);
});


it('keeps placement ghosts at completed-building scale, including definitions sharing one asset',async()=>{
 vi.spyOn(MineLabels.prototype,'update').mockImplementation(()=>{});
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:modelFixture(),animations:[]} as any);
 const raw=source(),base=(raw.definitions as AuthoredDefinition[]).find(d=>d.id==='building.test.house')!;
 const shared=(raw.definitions as AuthoredDefinition[]).find(d=>d.id==='building.test.barracks')!;
 base.modelScale=1.6;shared.asset=base.asset;shared.modelScale=.7;
 const registry=layerRegistry(raw),scene=new Scene(),layer=new SettlementLayer(scene,registry),field=new HeightField();
 await layer.ready;
 const g=game([placed('house',base.id,205,210)],draft=>{(draft.definitions as AuthoredDefinition[]).find(d=>d.id===base.id)!.modelScale=base.modelScale;}),state=g.view();
 const entity=state.entities.find(e=>e.definition===base.id)!;
 layer.update({...state,entities:[entity]},field,0);await layer.ready;layer.update({...state,entities:[entity]},field,0);
 const body=scene.getObjectByName('game-entities')!.children.find(o=>o.userData.entityId===entity.id)!.getObjectByName('Body')!;
 layer.preview(base.id,210,215,true,field);
 const ghost=(layer as unknown as {placementModel:Group}).placementModel;
 expect(ghost.scale.toArray()).toEqual(body.scale.toArray());
 layer.preview(shared.id,210,215,true,field);
 expect((layer as unknown as {placementModel:Group}).placementModel).toBe(ghost);
 expect(ghost.scale.x).toBeCloseTo((registry.asset(shared.asset).scale??1)*.7);
 layer.preview(null,0,0,true,field);expect(ghost.visible).toBe(false);
 layer.destroy(scene);
});

it('starts the selected building rally route at its center regardless of its facing',async()=>{
 vi.spyOn(MineLabels.prototype,'update').mockImplementation(()=>{});
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:modelFixture(),animations:[]} as any);
 const scene=new Scene(),g=game(),layer=new SettlementLayer(scene,layerRegistry()),view=g.view(),field=new HeightField();
 const building=view.entities.find(e=>e.definition==='building.test.fort'&&e.owner==='player.1')!;
 const update=vi.spyOn(RallyMarkers.prototype,'update');layer.viewer(0,()=> 'own');layer.select([building.id]);
 for(const rotation of [0,90,180,270]){
  const state={...view,entities:[{...building,rotation,production:{...building.production!,rally:{x:180,y:180}}}]};
  layer.update(state,field,0);await layer.ready;layer.update(state,field,0);
  expect(update.mock.calls.at(-1)![0]).toEqual([{id:building.id,slot:0,from:{x:building.x,z:building.y,surface:undefined},to:{x:180,z:180,surface:undefined}}]);
 }
 layer.destroy(scene);
});

it('keeps the physical charge pose during cast recovery and resumes attacks after contact',async()=>{
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>({scene:modelFixture(),animations:['idle','walk','run','charge','attack','hit','death'].map(name=>new AnimationClip(name,1,[]))}) as any);
 const scene=new Scene(),g=game([placed('dash','unit.test.thornblade',205,210)]),layer=new SettlementLayer(scene,layerRegistry()),view=g.view(),field=new HeightField();
 const e=view.entities.find(e=>e.definition==='unit.test.thornblade')!;
 const casting={ability:'ability.test.thorn-rush',startTick:0,resolveTick:2,finishTick:14};
 const state={...view,entities:[{...e,unit:{...e.unit!,moving:true,charging:true,casting}}]};
 layer.update(state,field,4);await layer.ready;layer.update(state,field,4);
 const player=(layer as any).characters.get(e.id).player;
 expect(player.state).toBe('charge');
 layer.update({...state,entities:[{...state.entities[0],unit:{...state.entities[0].unit,moving:false,charging:false}}]},field,8);
 expect(player.state).toBe('attack');layer.destroy(scene);
});

it('drops airborne corpses onto their flight floor while leaving ground corpses in place',async()=>{
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>({scene:modelFixture(),animations:['idle','walk','run','attack','hit','death'].map(name=>new AnimationClip(name,2,[]))}) as any);
 const scene=new Scene(),g=game([placed('air','unit.test.warrior',205,210),placed('ground','unit.test.warrior',215,210)]),layer=new SettlementLayer(scene,layerRegistry()),view=g.view(),field=new HeightField();
 // A raised flight floor also covers water/decks; it must not fall through to raw terrain.
 const air=view.entities.find(e=>e.x===205&&e.y===210)!,ground=view.entities.find(e=>e.x===215&&e.y===210)!;
 const airborne={...air,elevation:7,unit:{...air.unit!,flight:{height:3}}};
 const live={...view,fog:undefined,entities:[airborne,ground]};
 layer.update(live,field,0);await layer.ready;layer.update(live,field,0);
 const root=scene.getObjectByName('game-entities')!,flying=root.children.find(o=>o.userData.entityId===air.id)!,standing=root.children.find(o=>o.userData.entityId===ground.id)!;
 const initial=flying.position.y,groundY=standing.position.y;
 const dead={...live,entities:[],deaths:[airborne,ground]};layer.update(dead,field,1);expect(flying.position.y).toBe(initial);
 layer.update(dead,field,11);expect(flying.position.y).toBeLessThan(initial);expect(flying.position.y).toBeGreaterThan(4);expect(standing.position.y).toBe(groundY);
 layer.update(dead,field,41);expect(flying.position.y).toBe(4);expect(standing.position.y).toBe(groundY);
 layer.update(dead,field,90);expect(flying.parent).toBeNull();expect(standing.parent).toBeNull();layer.destroy(scene);
});
