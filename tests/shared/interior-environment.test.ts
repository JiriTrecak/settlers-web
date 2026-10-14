import {it,expect} from 'vitest';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
import {Sky} from '../../src/render/sky/sky';
import {Scene} from 'three';
it('strips retired map-owned interior appearance from saved landscapes',()=>{
 const landscape=emptyLandscape();
 for(const extra of [{interior:true,floorMaterial:'heartwood',ceilingHeight:18,preset:'heartwood-interior'}, {interior:'yes',floorMaterial:'marble',ceilingHeight:Infinity}]){
  expect(parseLandscape({...landscape,environment:{...landscape.environment,...extra}})).toEqual(landscape);
 }
});
it('holds the sky clock while paused and advances it while playing',()=>{
 const sky=new Sky(new Scene());sky.setHour(10);sky.setPlaying(false);sky.tick(1000);sky.tick(301000);expect(sky.hour).toBe(10);
 sky.setPlaying(true);sky.tick(302000);sky.tick(303000);expect(sky.hour).toBeGreaterThan(10);
});
