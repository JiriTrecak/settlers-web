import {it,expect} from 'vitest';
import {DEFAULT_WATER_STYLE,parseWaterStyle} from '../../src/shared/landscape/waterStyle';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
it('roundtrips clear stream and indoor pool appearance through map landscape data',()=>{
 const water={...DEFAULT_WATER_STYLE,shallowColor:'#827553',deepColor:'#103e40',clarity:4.5,flowSpeed:.8};
 expect(parseLandscape({...emptyLandscape(),water})?.water).toEqual(water);
 expect(parseWaterStyle(DEFAULT_WATER_STYLE)).toEqual(DEFAULT_WATER_STYLE);
});
it.each([{clarity:0},{clarity:Infinity},{flowSpeed:-1},{flowSpeed:4},{shallowColor:'red'},{deepColor:'#abcdef00'}])('rejects invalid new water parameters: %j',patch=>{
 expect(parseWaterStyle({...DEFAULT_WATER_STYLE,...patch})).toBeUndefined();
});
