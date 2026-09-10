import {expect,it} from 'vitest';
import {bridgeSurfaces,bridgeHeight,applyBridgeSurfaces} from '../../src/shared/map/bridgeSurface';
it('matches the arched deck while retaining the underlying water bed',()=>{
 const surfaces=bridgeSurfaces([{id:'b',asset:'timber-bridge',x:12,y:12,yaw:Math.PI/2,elevation:2,depthScale:2}],()=>-1);
 expect(bridgeHeight(surfaces,12.5,12.5)).toBeCloseTo(1.96);
 expect(bridgeHeight(surfaces,20.5,12.5)).toBeCloseTo(1.61);
 expect(bridgeHeight(surfaces,12.5,15)).toBeUndefined();
 const land=new Uint8Array(32*32),heights=new Int16Array(32*32).fill(-100);
 const deck=applyBridgeSurfaces(32,surfaces,land,heights);
 expect(land[12*32+12]).toBe(1);expect(deck[12*32+12]).toBe(1);expect(heights[12*32+12]).toBe(196);
 expect(land[15*32+12]).toBe(0);expect(heights[15*32+12]).toBe(-100);
});
