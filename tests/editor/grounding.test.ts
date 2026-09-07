import { expect,it } from 'vitest';
import { prototypeGroundOffset } from '../../src/render/prop/grounding';
it('preserves buried roots while correcting floating imports',()=>{
 expect(prototypeGroundOffset('synty-tree-willow-large-01',-.92,false)).toBe(0);
 expect(prototypeGroundOffset('woodland-pine-1',-.2,false)).toBe(0);
 expect(prototypeGroundOffset('synty-tree-birch-01',1.2,false)).toBe(-1.2);
 expect(prototypeGroundOffset('reference-rock',-.5,false)).toBe(.5);
 expect(prototypeGroundOffset('river-reeds',-.3,true)).toBe(0);
});
