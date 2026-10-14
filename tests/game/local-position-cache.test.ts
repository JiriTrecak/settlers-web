import {expect,it} from 'vitest';
import {LocalPositionCache} from '../../src/sim/game/localPositionCache';

it('bounds retained positions and entries, and keeps distant geometry after local invalidation',()=>{
 const cache=new LocalPositionCache(3,2),near={minX:2,minY:2,maxX:4,maxY:4},far={minX:10,minY:10,maxX:12,maxY:12};
 cache.set('near',[{x:3,y:3}],near);cache.set('far',[{x:11,y:11}],far);
 cache.invalidate([3*32+3],32);expect(cache.get('near')).toBeUndefined();expect(cache.get('far')).toBeDefined();
 cache.set('next',[{x:3,y:3},{x:4,y:3}],near);
 cache.set('latest',[{x:5,y:3},{x:6,y:3}],near);
 expect(cache.get('far')).toBeUndefined();expect(cache.get('next')).toBeUndefined();expect(cache.get('latest')).toHaveLength(2);
 cache.set('oversize',Array.from({length:4},(_,x)=>({x,y:3})),near);expect(cache.get('oversize')).toBeUndefined();
 cache.clear();expect(cache.get('latest')).toBeUndefined();
});
