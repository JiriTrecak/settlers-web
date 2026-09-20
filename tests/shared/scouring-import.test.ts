import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ImportedTerrain,importedTerrainSchema,sourceHeight,unpackSourceBytes} from '../../src/shared/map/importedTerrain';
import {sourceWater} from '../../src/shared/map/importedWater';
import {parseUtcMap,stringifyUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {sourceHeightGeometry} from '../../src/render/height/sourceHeightGeometry';
import {bridgeSurfaces,surfaceHeight} from '../../src/shared/map/bridgeSurface';
import {WalkSurfaces} from '../../src/shared/map/walkSurfaces';
const map=JSON.parse(readFileSync('assets/maps/showcase/scouring-eldenvale.utcmap','utf8')) as UtcMap;
const source=map.landscape!.importedTerrain!;
const terrain=sourceHeight(source);
describe('lossless Scouring map import',()=>{
 it('preserves all original plant shelter/damage bytes through map persistence',()=>{
  const decoded=JSON.parse(readFileSync('art/references/scouring-maps/eldenvale/terrain.json','utf8'));
  const parsed=parseUtcMap(JSON.parse(stringifyUtcMap(map)))!;
  expect(decoded.plants).toHaveLength(4847);
  for(let i=0;i<decoded.plants.length;i++)expect(parsed.stamps[i]!.sourceTransform!.packedUserData).toEqual(decoded.plants[i].packedUserData);
  const bad=JSON.parse(stringifyUtcMap(map));bad.stamps[0].sourceTransform.packedUserData=[256,0,0];
  expect(parseUtcMap(bad)).toBeNull();
 });
 it('retains source raster/masks/grass byte-for-byte through map persistence',()=>{
  const parsed=parseUtcMap(JSON.parse(stringifyUtcMap(map)))!;expect(parsed).not.toBeNull();
  const converted=parsed.landscape!.importedTerrain!;
  expect(Buffer.from(unpackSourceBytes(converted.height))).toEqual(readFileSync('art/references/scouring-maps/eldenvale/height.u16'));
  expect(converted.layers.map(l=>l.name)).toEqual(['soil','grass','graysoil','dirt','waterbed','stones','darkrock','rock','darksoil','rockgrass','darkgrass']);
  expect(converted.grass.reduce((n,g)=>n+unpackSourceBytes(g.instances).length/8,0)).toBe(46422);
  expect(parsed.stamps).toEqual(map.stamps);expect(parsed.stamps.length).toBe(4986);
 });
 it('identifies the stored displacement mask from independently decoded layer erasure',()=>{
  const rock=unpackSourceBytes(source.layers.find(l=>l.name==='rock')!.mask!);
  const grass=unpackSourceBytes(source.layers.find(l=>l.name==='rockgrass')!.mask!);
  const dark=unpackSourceBytes(source.layers.find(l=>l.name==='darkgrass')!.mask!);
  const reconstructed=Buffer.from(rock.map((value,i)=>Math.round(value*(1-grass[i]!/255)*(1-dark[i]!/255))));
  expect(reconstructed).toEqual(readFileSync('art/references/scouring-maps/eldenvale/terrain-auxiliary.u8'));
  expect(Buffer.from(unpackSourceBytes(source.displacement!.mask))).toEqual(reconstructed);
  expect(source.displacement!.texture).toBe('tiles_rock_displacement__a');
  expect(importedTerrainSchema.safeParse({...source,displacement:{...source.displacement,mask:'AAAA'}}).success).toBe(false);
 });
 it('matches source three-corner normals on an independently constructed planar heightfield',()=>{
  const raw=Buffer.alloc(49*49*2);
  for(let z=0;z<49;z++)for(let x=0;x<49;x++)raw.writeUInt16LE(10000+x*100+z*50,(z*49+x)*2);
  const plane=sourceHeight({...source,blocks:[1,1],origin:[0,0],heightSize:[49,49],height:raw.toString('base64')});
  const nx=-100*64/65535/(8/49),nz=-50*64/65535/(8/49),length=Math.hypot(nx,2,nz);
  const actual=plane.normal(8,8);
  expect(actual[0]).toBeCloseTo(nx/length,8);expect(actual[1]).toBeCloseTo(2/length,8);expect(actual[2]).toBeCloseTo(nz/length,8);
 });
 it('preserves neutral camp coordinates and records unresolved variant choices',()=>{
  const game=JSON.parse(readFileSync('art/references/scouring-maps/eldenvale/gameplay.json','utf8'));
  const neutral=map.stamps.slice(4934,4984);
  expect(neutral).toHaveLength(game.neutrals.length);
  for(let i=0;i<neutral.length;i++){
   const source=game.neutrals[i],stamp=neutral[i]!;
   expect(stamp.x+.5-256).toBe(source.position[0]);expect(stamp.y+.5-256).toBe(source.position[1]);
   expect(stamp.sourceTransform!.height).toBeCloseTo(terrain.sample(stamp.x+.5,stamp.y+.5),8);
  }
  expect(map.stamps.filter(s=>s.asset==='reference-neutral-outpost')).toHaveLength(2);
  expect(map.stamps.some(s=>s.asset==='reference-dungeon-entrance')).toBe(false);
  const audit=JSON.parse(readFileSync('art/references/scouring-maps/eldenvale/conversion-audit.json','utf8'));
  expect(audit.objects.filter((x:{variantPolicy?:string})=>x.variantPolicy)).toHaveLength(16);
 });
 it('uses original height samples and seamless neighboring normals, without centimeter quantization',()=>{
  const a=sourceHeightGeometry(terrain,6,13),b=sourceHeightGeometry(terrain,7,13),ap=a.getAttribute('position'),bp=b.getAttribute('position'),an=a.getAttribute('normal'),bn=b.getAttribute('normal');
  for(let z=0;z<49;z++){
   expect(ap.getY(z*49+48)).toBeCloseTo(terrain.at(7*48,13*48+z),5);
   expect(ap.getX(z*49+48)).toBe(bp.getX(z*49));expect(ap.getY(z*49+48)).toBe(bp.getY(z*49));
   expect(an.getX(z*49+48)).toBe(bn.getX(z*49));expect(an.getY(z*49+48)).toBe(bn.getY(z*49));expect(an.getZ(z*49+48)).toBe(bn.getZ(z*49));
  }a.dispose();b.dispose();
 });
 it('rejects truncated source heights, masks, water, and fractional grass records',()=>{
  expect(importedTerrainSchema.safeParse({...source,height:source.height.slice(4)}).success).toBe(false);
  expect(importedTerrainSchema.safeParse({...source,layers:[source.layers[0],{...source.layers[1],mask:'AAAA'}]}).success).toBe(false);
  expect(importedTerrainSchema.safeParse({...source,grass:[{asset:'reference-grass-low',instances:'AAAA'}]}).success).toBe(false);
  expect(importedTerrainSchema.safeParse({...source,water:[{x:0,z:0,payload:'AAAA'}]}).success).toBe(false);
 });
 it('decodes independently packed water cells as BGRA flow and LE UNORM heights',()=>{
  const raw=new Uint8Array(1540),view=new DataView(raw.buffer);
  for(let i=0;i<256;i++){raw.set([9,130,125,42],i*4);view.setUint16(1024+i*2,16384,true);}
  const s={...source,blocks:[1,1],origin:[10,20],water:[{x:0,z:0,payload:Buffer.from(raw).toString('base64')}]} as ImportedTerrain;
  const water=sourceWater(s);expect(Array.from(water.flow.slice(0,4))).toEqual([125,130,9,42]);expect(water.sample(15,25)).toBeCloseTo(16384*64/65535-24,5);
 });
 it('rejects ambiguous water cells and out-of-bounds GPU layer/grass references',()=>{
  const slots=unpackSourceBytes(source.layerSlots);slots[1]=source.layers.length;
  expect(importedTerrainSchema.safeParse({...source,layerSlots:Buffer.from(slots).toString('base64')}).success).toBe(false);
  expect(importedTerrainSchema.safeParse({...source,water:[source.water[0],source.water[0]]}).success).toBe(false);
  const grass=Buffer.from([source.blocks[0],0,0,0,0,0,0,0]).toString('base64');
  expect(importedTerrainSchema.safeParse({...source,grass:[{asset:'reference-grass-low',instances:grass}]}).success).toBe(false);
 });
 it('uses original bridge helper triangles for both bidirectional river crossings',()=>{
  const decks=bridgeSurfaces(map.stamps,(x,z)=>terrain.sample(x,z));expect(decks).toHaveLength(2);
  const deck=decks[0]!;expect(deck.triangles).toHaveLength(18);
  // Independent barycenter of a stored world triangle lies on its plane.
  const [a,b,c]=deck.triangles!;const x=(a![0]+b![0]+c![0])/3,z=(a![2]+b![2]+c![2])/3;
  expect(surfaceHeight(deck,x,z)).toBeCloseTo((a![1]+b![1]+c![1])/3,8);
  expect(surfaceHeight(deck,deck.x+30,deck.z)).toBeUndefined();
  const water=sourceWater(source),heights=new Int16Array(512*512),land=new Uint8Array(512*512);
  for(let z=0;z<512;z++)for(let x=0;x<512;x++){const h=terrain.sample(x,z);heights[z*512+x]=Math.round(h*100);land[z*512+x]=h>=water.sample(x,z)-.6?1:0;}
  const graph=new WalkSurfaces(512,heights,land,decks);
  for(const crossing of decks){
   const cx=Math.round(crossing.x),lo=Math.floor(crossing.z-crossing.depth/2)-2,hi=Math.ceil(crossing.z+crossing.depth/2)+2;
   for(const [from,to] of [[lo,hi],[hi,lo]]){
    const route=graph.path({x:cx,y:from!},{x:cx,y:to!});expect(route,`${crossing.id}: ${from} → ${to}`).not.toBeNull();
    expect(route!.some(n=>n.surface===crossing.id)).toBe(true);
    expect(route!.filter(n=>n.surface).every(n=>n.surface===crossing.id)).toBe(true);
    let transitions=0;
    for(let i=0;i<route!.length;i++){
     const p=route![i]!;
     if(!p.surface)expect(land[p.y*512+p.x]).toBe(1);
     if(i&&p.surface!==route![i-1]!.surface)transitions++;
    }
    expect(transitions).toBe(2);
   }
  }
 },10000);
});
