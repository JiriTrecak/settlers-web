import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeHeight, parseUtcMap, stringifyUtcMap, HeightField } from '../../src/shared';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/showcase/Twinwater-Reach.utcmap','utf8')))!;
describe('Twinwater Reach',()=>{
  it('preserves two opposite starting positions through map serialization',()=>{
    expect(map).not.toBeNull();
    expect(map.playerStarts).toEqual([{player:1,x:218,z:218},{player:2,x:38,z:38}]);
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))?.playerStarts).toEqual(map.playerStarts);
    expect(parseUtcMap({...map,playerStarts:[{player:1,x:NaN,z:0}]})).toBeNull();
  });
  it('has exact height symmetry and paired object types and scales',()=>{
    const heights=decodeHeight(map.height!)!;
    expect(Array.from(heights)).toEqual(Array.from(heights).reverse());
    for(let i=0;i<map.stamps.length;i+=2){const a=map.stamps[i]!,b=map.stamps[i+1]!;expect(a.asset).toBe(b.asset);expect(a.scale).toBe(b.scale);expect(a.x+b.x).toBeCloseTo(255,3);expect(a.y+b.y).toBeCloseTo(255,3);}
    const d=map.landscape!.decals!;for(let i=0;i<d.length;i+=2){expect(d[i]!.x+d[i+1]!.x).toBeCloseTo(256);expect(d[i]!.z+d[i+1]!.z).toBeCloseTo(256);expect(d[i]!.kind).toBe(d[i+1]!.kind);}
  });
  it('keeps 44m-wide home pads flat and tree crowns away from them',()=>{
    const field=new HeightField();field.load(decodeHeight(map.height!)!,0);
    for(const start of map.playerStarts!){
      for(let z=-21;z<=21;z++)for(let x=-21;x<=21;x++)if(Math.hypot(x,z)<22)expect(field.sample(start.x+x,start.z+z)).toBeCloseTo(2.6,2);
      for(const tree of map.stamps.filter(s=>/^(pine-chunky|tree-chunky)/.test(s.asset)))expect(Math.hypot(tree.x+.5-start.x,tree.y+.5-start.z)).toBeGreaterThanOrEqual(29.999);
    }
  });
  it('provides dry, tree-free approaches across all three river crossings',()=>{
    const field=new HeightField();field.load(decodeHeight(map.height!)!,0);
    const routes=[[[38,38],[68,68],[96,96],[128,128]],[[38,38],[80,38],[126,44],[158,66],[174,82]],[[38,38],[38,80],[44,126],[66,158],[82,174]]];
    for(const route of routes)for(let k=0;k<route.length-1;k++){
      const a=route[k]!,b=route[k+1]!,length=Math.hypot(b[0]!-a[0]!,b[1]!-a[1]!);
      for(let j=0;j<=length;j++){const t=j/length,x=a[0]!+(b[0]!-a[0]!)*t,z=a[1]!+(b[1]!-a[1]!)*t;expect(field.sample(x,z)).toBeGreaterThan(.5);for(const tree of map.stamps.filter(s=>/^(pine-chunky|tree-chunky)/.test(s.asset)))expect(Math.hypot(tree.x+.5-x,tree.y+.5-z)).toBeGreaterThan(8.9);}
    }
  });
});
