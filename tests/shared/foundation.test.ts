import {expect,it} from 'vitest';
import {foundationTerrainFits} from '../../src/shared/spatial/foundation';
const bounds={minX:0,minY:0,maxX:19,maxY:19};
it('accepts gentle rolling ground without making the result depend on absolute elevation',()=>{
 const ground=(x:number,y:number)=>Math.round(65*Math.sin(x/5)+30*Math.cos(y/6));
 expect(foundationTerrainFits(bounds,ground)).toBe(true);
 expect(foundationTerrainFits(bounds,(x,y)=>ground(x,y)+1400)).toBe(true);
});
it('rejects a low sharp ledge even when its total relief is tolerable',()=>{
 expect(foundationTerrainFits(bounds,x=>x<10?0:80)).toBe(false);
});
it('rejects broad climbs, steep short ramps, and depressions hidden between the corners',()=>{
 expect(foundationTerrainFits(bounds,x=>x*20)).toBe(false);
 expect(foundationTerrainFits({minX:0,minY:0,maxX:3,maxY:3},x=>x*45)).toBe(false);
 expect(foundationTerrainFits(bounds,(x,y)=>x===10&&y===10?-150:0)).toBe(false);
});
it('uses identical rules after rotating the footprint',()=>{
 const rectangle={minX:3,minY:7,maxX:10,maxY:18};
 const rotated={minX:7,minY:3,maxX:18,maxY:10};
 for(const rise of [10,30,50])expect(foundationTerrainFits(rectangle,(x,y)=>rise*x+y))
  .toBe(foundationTerrainFits(rotated,(x,y)=>rise*y+x));
});
