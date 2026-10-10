import {expect,it} from 'vitest';
import {forestCoverStroke} from '../../src/editor/world/forestCover';
it('paints persistent forest cover without making a patch for every sample',()=>{
 const patches=forestCoverStroke([{x:10,z:10},{x:50,z:10}],8);
 expect(patches.length).toBeGreaterThan(3);expect(patches.length).toBeLessThan(10);
 expect(patches.every(p=>p.palette==='forest'&&p.radius===8)).toBe(true);
 expect(forestCoverStroke([{x:10,z:10},{x:50,z:10}],8)).toEqual(patches);
});
