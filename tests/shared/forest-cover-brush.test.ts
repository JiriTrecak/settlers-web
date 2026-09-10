import {expect,it} from 'vitest';
import {forestCoverStroke} from '../../src/editor/world/forestCover';
import {wipeStamps} from '../../src/editor/clean/clean';
it('paints persistent forest cover without making a patch for every sample',()=>{
 const patches=forestCoverStroke([{x:10,z:10},{x:50,z:10}],8);
 expect(patches.length).toBeGreaterThan(3);expect(patches.length).toBeLessThan(10);
 expect(patches.every(p=>p.palette==='forest'&&p.radius===8)).toBe(true);
 expect(forestCoverStroke([{x:10,z:10},{x:50,z:10}],8)).toEqual(patches);
});
it('erases imported foliage without erasing the environment structures',()=>{
 const stamps=['tree_primary','coniferous_trees_05','grass_v5_03','lowpolymushroom_01','timber-bridge'].map(asset=>({id:asset,asset,x:10,y:10}));
 expect(wipeStamps(stamps,[{x:10,z:10}],3,'foliage').map(s=>s.asset)).toEqual(['timber-bridge']);
});
