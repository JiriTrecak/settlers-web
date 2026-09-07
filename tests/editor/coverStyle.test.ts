import {describe,it,expect} from 'vitest';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
describe('saved grass brush proportions',()=>{
 const patch={x:10,z:12,radius:8,density:2,seed:73,flowers:.2};
 it('preserves authored proportions without changing legacy patches',()=>{
  const landscape={...emptyLandscape(),cover:[{...patch,grassScale:.85,broadRatio:.3},patch]};
  const loaded=parseUtcMap(JSON.parse(stringifyUtcMap({...emptyUtcMap(),landscape})));
  expect(loaded?.landscape?.cover).toEqual(landscape.cover);
 });
 it('rejects malformed proportions before rebuilding ground cover',()=>{
  for(const grassScale of [0,5,NaN,Infinity,'1'])expect(parseLandscape({...emptyLandscape(),cover:[{...patch,grassScale}]})).toBeUndefined();
  for(const broadRatio of [-.1,1.1,NaN,Infinity,'0'])expect(parseLandscape({...emptyLandscape(),cover:[{...patch,broadRatio}]})).toBeUndefined();
  expect(parseLandscape({...emptyLandscape(),cover:[{...patch,grassScale:.2,broadRatio:0},{...patch,grassScale:4,broadRatio:1}]})).toBeDefined();
 });
});
