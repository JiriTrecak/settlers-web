import {expect,it} from 'vitest';
import {World} from '../../src/sim/world/world';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {testContent} from '../fixtures/content';

it('profiling is per-world and leaves lockstep state unchanged, including restoration',()=>{
 const options={map:emptyUtcMap(),slots:[{player:0,kind:'human' as const},{player:1,kind:'ai' as const}],seed:123,registry:testContent};
 const off=new World(options),on=new World(options);on.settlement.context.profile.enabled=true;
 for(let i=0;i<100;i++){off.tick();on.tick();}
 expect(on.checksum()).toBe(off.checksum());expect(on.checksum('full')).toBe(off.checksum('full'));expect(on.snapshot()).toEqual(off.snapshot());
 expect(on.settlement.context.profile.snapshot().some(r=>r.path.includes('Containment'))).toBe(true);
 const saved=on.snapshot();on.restore(saved);
 for(let i=0;i<50;i++){off.tick();on.tick();}
 expect(on.checksum()).toBe(off.checksum());
 expect(on.checksum('full')).toBe(off.checksum('full'));
});
