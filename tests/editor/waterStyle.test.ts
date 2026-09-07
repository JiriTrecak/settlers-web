import {describe,it,expect} from 'vitest';
import {DEFAULT_WATER_STYLE,parseWaterStyle} from '../../src/shared/landscape/waterStyle';
import {emptyLandscape} from '../../src/shared/landscape/curve';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
describe('authored water appearance',()=>{
 it('survives map save and reload while legacy maps remain valid',()=>{
  const water={...DEFAULT_WATER_STYLE,rippleStrength:.21,foamStrength:.2,causticStrength:0,reflectionStrength:.2,shadowStrength:.25};
  const map={...emptyUtcMap(),landscape:{...emptyLandscape(),water}};
  expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))?.landscape?.water).toEqual(water);
  expect(parseUtcMap(emptyUtcMap())?.landscape).toBeUndefined();
  expect(parseWaterStyle(DEFAULT_WATER_STYLE)).toEqual(DEFAULT_WATER_STYLE);
 });
 it('rejects nonfinite and unsafe shader parameters',()=>{
  for(const invalid of [{rippleScale:0},{rippleStrength:Infinity},{cloudStrength:NaN},{foamStrength:2},{causticStrength:-1},{causticStrength:Infinity},{reflectionStrength:2},{reflectionStrength:NaN},{shadowStrength:-1},{shadowStrength:2},{shadowStrength:NaN},{shadowStrength:'0.2'}])expect(parseWaterStyle({...DEFAULT_WATER_STYLE,...invalid})).toBeUndefined();
 });
});
