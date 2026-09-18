import {it,expect} from 'vitest';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
import {environmentPreset,validLight} from '../../src/shared/environment/presets';
import {Sky} from '../../src/render/sky/sky';
import {Scene} from 'three';
it('round trips interior floor and lighting declarations and rejects invalid authoring values',()=>{
 const landscape=emptyLandscape();Object.assign(landscape.environment,{interior:true,floorMaterial:'heartwood',ceilingHeight:18,preset:'heartwood-interior'});
 expect(parseLandscape(JSON.parse(JSON.stringify(landscape)))).toEqual(landscape);
 expect(parseLandscape({...landscape,environment:{...landscape.environment,interior:'yes'}})).toBeUndefined();
 expect(parseLandscape({...landscape,environment:{...landscape.environment,floorMaterial:'marble'}})).toBeUndefined();
 for(const ceilingHeight of [0,129,NaN,Infinity,'18'])expect(parseLandscape({...landscape,environment:{...landscape.environment,ceilingHeight}})).toBeUndefined();
 expect(validLight(environmentPreset('heartwood-interior').light)).toBe(true);
});
it('keeps indoor lighting fixed while the normal exterior clock remains available',()=>{
 const sky=new Sky(new Scene());sky.setHour(10);sky.setPlaying(false);sky.tick(1000);sky.tick(301000);expect(sky.hour).toBe(10);
 sky.setPlaying(true);sky.tick(302000);sky.tick(303000);expect(sky.hour).toBeGreaterThan(10);
});
