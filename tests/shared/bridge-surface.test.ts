import {expect,it} from 'vitest';
import {bridgeHeight,applyBridgeSurfaces,type BridgeSurface} from '../../src/shared/map/bridgeSurface';
it('matches an arched deck while retaining the underlying water bed',()=>{
 const surfaces:BridgeSurface[]=[{id:'b',level:1,x:12.5,z:12.5,c:0,s:1,width:4,depth:24,base:1,height:.26,arch:.7,thickness:.4}];
 expect(bridgeHeight(surfaces,12.5,12.5)).toBeCloseTo(1.96);
 expect(bridgeHeight(surfaces,20.5,12.5)).toBeCloseTo(1.61);
 expect(bridgeHeight(surfaces,12.5,15)).toBeUndefined();
 const land=new Uint8Array(32*32),heights=new Int16Array(32*32).fill(-100);
 const deck=applyBridgeSurfaces(32,surfaces,land,heights);
 expect(land[12*32+12]).toBe(1);expect(deck[12*32+12]).toBe(1);expect(heights[12*32+12]).toBe(196);
 expect(land[15*32+12]).toBe(0);expect(heights[15*32+12]).toBe(-100);
});
