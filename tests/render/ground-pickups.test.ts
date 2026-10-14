import {Mesh,Texture,TextureLoader} from 'three';
import {afterEach,expect,it,vi} from 'vitest';
import {BoxGeometry,MeshStandardMaterial,Group,Scene} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SettlementLayer} from '../../src/render/settlement/settlementLayer';
import {HeightField} from '../../src/shared/map/height';
import {game,placed} from '../game/helpers';
// ENGINE-COUPLED: settlement presentation validates construction/shell effects against the global effect library
// (no injection point), so the test effects stand in for the shipped library.
vi.mock('../../src/content/effects/library',async importOriginal=>({...await importOriginal<object>(),coreEffects:(await import('../fixtures/content')).testEffects}));
afterEach(()=>vi.restoreAllMocks());
it('renders loose pickups at their selectable position with the declared asset scale',async()=>{
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>{const scene=new Group();scene.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));return {scene,animations:[]} as any;});
 vi.spyOn(TextureLoader.prototype,'load').mockImplementation((_url,onLoad)=>{const texture=new Texture({width:64,height:64} as HTMLImageElement);queueMicrotask(()=>onLoad?.(texture));return texture;});
 // A non-default declared scale proves the pickup body uses the asset's scale.
 const g=game([{...placed('loot','item.test.royal-crest',219,230),owner:'none'}],draft=>{const item=(draft.definitions as {id:string;asset:string}[]).find(d=>d.id==='item.test.royal-crest')!;(draft.assets as {id:string;scale?:number}[]).find(a=>a.id===item.asset)!.scale=1.75;});
 const scene=new Scene(),layer=new SettlementLayer(scene,g.registry);await layer.ready;
 const view=g.view(),pickup=view.entities.find(e=>e.definition==='item.test.royal-crest')!;
 expect(pickup).toBeDefined();const field=new HeightField(),state={...view,entities:[pickup]};layer.update(state,field,0);await layer.ready;layer.update(state,field,0);
 const root=(layer as any).entities.get(pickup.id),body=root.getObjectByName('Body');
 expect(body.visible).toBe(true);
 expect(body.position.x).toBe(0);expect(body.position.z).toBe(0);
 expect(body.scale.x).toBe(1.75);
 expect(root.getObjectByName('Stockpile')).toBeUndefined();
 layer.destroy(scene);
});
