import {expect,it,vi} from 'vitest';
import {Scene} from 'three';
import {SceneryComposition} from '../../src/presentation/sceneryChanges';
import {SceneryLights} from '../../src/render/prop/sceneryLights';
import {HeightField} from '../../src/shared/map/height';
import {sceneryCatalogue} from '../../src/shared/assets/manifest';
import {parseCatalogue} from '../../src/shared/asset/catalog';

it('retains lights across unrelated harvests but refreshes moves, terrain and invalidation',()=>{
 const asset=parseCatalogue(sceneryCatalogue)!.assets.find(a=>a.light)!.id;
 const scene=new Scene(),lights=new SceneryLights(scene),height=new HeightField(32),sample=vi.spyOn(height,'sample');
 const compose=new SceneryComposition(),lamp={id:'lamp',asset,x:5,y:5},base=[lamp],tree={id:'tree',asset:'pine',x:2,y:2};
 lights.sync(compose.compose(base,[tree]),height);const first=lights.groundSources;sample.mockClear();
 lights.sync(compose.compose(base,[]),height);
 expect(lights.groundSources).toBe(first);expect(sample).not.toHaveBeenCalled();
 const moved=compose.compose([{...lamp,x:8}],[]);lights.sync(moved,height);
 expect(lights.groundSources[0].x-first[0].x).toBeCloseTo(3,12);
 sample.mockClear();lights.invalidate();lights.sync(moved,height);expect(sample).toHaveBeenCalledOnce();
 const higher=new HeightField(32);higher.samples.fill(4);lights.sync(moved,higher);expect(lights.groundSources[0].y-first[0].y).toBeCloseTo(4,12);
 lights.sync(compose.compose([],[]),higher);expect(lights.groundSources).toEqual([]);
 expect(scene.children.every(light=>!light.visible)).toBe(true);lights.dispose();
});
