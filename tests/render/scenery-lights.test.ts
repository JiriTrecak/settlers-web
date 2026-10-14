import {expect,it,vi} from 'vitest';
import {Scene} from 'three';
import {SceneryComposition} from '../../src/presentation/sceneryChanges';
import {SceneryLights} from '../../src/render/prop/sceneryLights';
import {HeightField} from '../../src/shared/map/height';
import {sceneryCatalogue} from '../../src/shared/assets/manifest';
import {parseCatalogue} from '../../src/shared/asset/catalog';

// Scenery lights read the shipped scenery catalogue at import; add a test-owned lantern to it.
vi.mock('../../src/shared/assets/manifest',async importOriginal=>{
 const m=await importOriginal<typeof import('../../src/shared/assets/manifest')>();
 const lantern={id:'test-lantern',name:'test lantern',category:'landmark',type:'prop',light:{x:0.78,y:2.25,z:-0.04,color:'#d8a457',intensity:1.6,range:5},file:'test/lantern.glb'};
 return {...m,sceneryCatalogue:{...m.sceneryCatalogue,assets:[...m.sceneryCatalogue.assets,lantern]}};
});

it('keeps lights through unrelated harvests and follows moves, terrain and invalidation',()=>{
 const asset=parseCatalogue(sceneryCatalogue)!.assets.find(a=>a.id==='test-lantern')!.id;
 const scene=new Scene(),lights=new SceneryLights(scene),height=new HeightField(32);
 const compose=new SceneryComposition(),lamp={id:'lamp',asset,x:5,y:5},base=[lamp],tree={id:'tree',asset:'pine',x:2,y:2};
 lights.sync(compose.compose(base,[tree]),height);const first=lights.groundSources;
 lights.sync(compose.compose(base,[]),height);
 expect(lights.groundSources).toEqual(first);
 const moved=compose.compose([{...lamp,x:8}],[]);lights.sync(moved,height);
 expect(lights.groundSources[0].x-first[0].x).toBeCloseTo(3,12);
 lights.invalidate();lights.sync(moved,height);expect(lights.groundSources[0].x-first[0].x).toBeCloseTo(3,12);
 const higher=new HeightField(32);higher.samples.fill(4);lights.sync(moved,higher);expect(lights.groundSources[0].y-first[0].y).toBeCloseTo(4,12);
 lights.sync(compose.compose([],[]),higher);expect(lights.groundSources).toEqual([]);
 expect(scene.children.every(light=>!light.visible)).toBe(true);lights.dispose();
});
