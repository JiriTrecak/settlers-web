import {describe,it,expect} from 'vitest';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
describe('authored prop lean',()=>{
 const stamp={id:'tree',asset:'pine',x:8,y:9,pitch:.12,roll:-.18,heightScale:.86};
 it('retains lean through save/reload and accepts legacy upright stamps',()=>{
  expect(parseUtcMap(JSON.parse(stringifyUtcMap({...emptyUtcMap(),stamps:[stamp]})))?.stamps[0]).toEqual(stamp);
  expect(parseUtcMap({...emptyUtcMap(),stamps:[{id:'old',asset:'pine',x:1,y:1}]})).not.toBeNull();
 });
 it('round-trips independent local footprint scales and rejects invalid values',()=>{
  const scaled={...stamp,widthScale:.8,depthScale:1.3};
  expect(parseUtcMap(JSON.parse(stringifyUtcMap({...emptyUtcMap(),stamps:[scaled]})))?.stamps[0]).toEqual(scaled);
  for(const key of ['widthScale','depthScale'])for(const value of [NaN,Infinity,0,5,'1'])expect(parseUtcMap({...emptyUtcMap(),stamps:[{...stamp,[key]:value}]})).toBeNull();
 });
 it('retains a stone palette through save/reload and rejects unknown variants',()=>{
  const rock={id:'cliff',asset:'synty-terrain-mountain-01',x:8,y:9,variant:'slate' as const};
  expect(parseUtcMap(JSON.parse(stringifyUtcMap({...emptyUtcMap(),stamps:[rock]})))?.stamps[0]).toEqual(rock);
  expect(parseUtcMap({...emptyUtcMap(),stamps:[{...rock,variant:'unknown'}]})).toBeNull();
 });
 it('rejects invalid lean before loading a scene',()=>{
  for(const heightScale of [NaN,Infinity,0,5,'1'])expect(parseUtcMap({...emptyUtcMap(),stamps:[{...stamp,heightScale}]})).toBeNull();
  for(const roll of [NaN,Infinity,2,'0.1'])expect(parseUtcMap({...emptyUtcMap(),stamps:[{...stamp,roll}]})).toBeNull();
 });
});
