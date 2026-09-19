import {expect,it} from 'vitest';
import {TacticalTerrain} from '../../src/shared/map/tacticalTerrain';
import {VisionMask} from '../../src/sim/game/visionMask';

it('uses elevated sight and projectile origins without making cliffs walkable',()=>{
 const n=16,h=new Int16Array(n*n);
 for(let y=0;y<n;y++)for(let x=6;x<n;x++)h[y*n+x]=300;
 const terrain=new TacticalTerrain(n,h),from={x:2,y:8},to={x:10,y:8};
 expect(terrain.visible(from,to)).toBe(false);
 expect(terrain.shotClear(from,to)).toBe(false);
 expect(terrain.visible({...from,elevation:4.9},to)).toBe(true);
 expect(terrain.shotClear({...from,elevation:4.9},to)).toBe(true);
 expect(terrain.meleeClear(from,to)).toBe(false);
 expect(terrain.visibleCells({...from,elevation:4.9},12)).toContain(8*n+10);
 expect(terrain.visibleCells(from,12)).not.toContain(8*n+10);
});

it('invalidates stationary sight masks on entering and leaving a lookout',()=>{
 const mask=new VisionMask(new Uint8Array(3));
 const source={id:1,x:0,y:0,radius:12};
 const footprint=(p:typeof source & {elevation?:number})=>p.elevation?[0,1,2]:[0];
 mask.update([source],footprint);expect([...mask.cells]).toEqual([2,0,0]);
 mask.update([{...source,elevation:4.9}],footprint);expect([...mask.cells]).toEqual([2,2,2]);
 mask.update([source],footprint);expect([...mask.cells]).toEqual([2,1,1]);
});
