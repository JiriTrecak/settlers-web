import {it,expect} from 'vitest';
import {DEFAULT_WATER_STYLE,parseWaterStyle} from '../../src/shared/landscape/waterStyle';
import {emptyLandscape} from '../../src/shared/landscape/curve';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
it('accepts clear stream and indoor pool water styles',()=>{
 const water={...DEFAULT_WATER_STYLE,shallowColor:'#827553',deepColor:'#103e40',clarity:4.5,flowSpeed:.8};
 expect(parseWaterStyle(water)).toEqual(water);
 expect(parseWaterStyle(DEFAULT_WATER_STYLE)).toEqual(DEFAULT_WATER_STYLE);
});
it.each([
 {clarity:0},{clarity:Infinity},{flowSpeed:-1},{flowSpeed:4},{shallowColor:'red'},{deepColor:'#abcdef00'},
 {rippleScale:0},{rippleStrength:Infinity},{cloudStrength:NaN},{foamStrength:2},{causticStrength:-1},{causticStrength:Infinity},
 {reflectionStrength:2},{reflectionStrength:NaN},{shadowStrength:-1},{shadowStrength:2},{shadowStrength:NaN},{shadowStrength:'0.2'},
])('rejects nonfinite or unsafe water parameters: %j',patch=>{
 expect(parseWaterStyle({...DEFAULT_WATER_STYLE,...patch})).toBeUndefined();
});
it('strips map-owned water overrides (biome-owned appearance) while keeping maps valid',()=>{
 const water={...DEFAULT_WATER_STYLE,rippleStrength:.21,foamStrength:.2,causticStrength:0,reflectionStrength:.2,shadowStrength:.25};
 const map={...emptyUtcMap(),landscape:{...emptyLandscape(),water}};
 expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))?.landscape?.water).toBeUndefined();
 expect(parseUtcMap(emptyUtcMap())?.landscape).toBeUndefined();
});
