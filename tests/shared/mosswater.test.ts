import {readFileSync,readdirSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {parseUtcMap,decodeHeight,HeightField,stringifyUtcMap} from '../../src/shared';
import {playableMapError} from '../../src/shared/map/playable';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/showcase/mosswater-divide.utcmap','utf8')))!;
describe('Mosswater Divide',()=>{
 it('is playable and round trips both starting positions',()=>{
  expect(playableMapError(map)).toBeNull();
  expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))?.playerStarts).toEqual([{player:1,x:210,z:210},{player:2,x:46,z:46}]);
  expect(readdirSync('assets/maps/showcase').filter(f=>f.endsWith('.utcmap')).sort()).toEqual(['ant-colony-compare.utcmap','mosswater-divide.utcmap']);
 });
 it('pairs terrain, resources and scenery under 180 degree rotation',()=>{
  const h=Array.from(decodeHeight(map.height!)!);expect(h).toEqual(h.slice().reverse());
  for(let i=0;i<map.stamps.length;i+=2){const a=map.stamps[i]!,b=map.stamps[i+1]!;expect(a.asset).toBe(b.asset);expect(a.scale).toBe(b.scale);expect(a.x+b.x).toBeCloseTo(255);expect(a.y+b.y).toBeCloseTo(255);}
 });
 it('keeps starting construction space clear and all three crossings dry',()=>{
  const f=new HeightField();f.load(decodeHeight(map.height!)!,0);
  for(const p of map.playerStarts!){
   for(let dz=-7;dz<=7;dz++)for(let dx=-7;dx<=7;dx++)expect(f.sample(p.x+dx,p.z+dz)).toBeCloseTo(1.3);
   for(const t of map.stamps.filter(s=>s.asset.startsWith('ant-pine')))expect(Math.hypot(t.x+.5-p.x,t.y+.5-p.z)).toBeGreaterThanOrEqual(19);
  }
  for(const z of [64,128,192])for(let x=108;x<=148;x++)expect(f.sample(x,z)).toBeGreaterThan(.5);
  // Grid flood fill verifies the two home clearings share traversable dry land.
  const seen=new Set<number>([46*256+46]),q=[46*256+46];
  for(let i=0;i<q.length;i++){const n=q[i]!,x=n%256,z=Math.floor(n/256);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx!,nz=z+dz!,id=nz*256+nx;if(nx<0||nz<0||nx>=256||nz>=256||seen.has(id)||f.sample(nx,nz)<.2||Math.abs(f.sample(nx,nz)-f.sample(x,z))>.6)continue;seen.add(id);q.push(id);}}
  expect(seen.has(210*256+210)).toBe(true);
 });
});
