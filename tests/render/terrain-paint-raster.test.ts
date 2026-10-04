import {expect,it} from 'vitest';
import {biomeById,biomeTerrainTile} from '../../src/content/biomes';
import {HeightField} from '../../src/shared/map/height';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';

it('encodes the same ordered mask blends, including overlapping layers and unknown materials',()=>{
 const field=new HeightField(16);field.samples.fill(2);field.waterLevel=-2;
 const biome=biomeById(field.biome),channels=['soil','grass','dirt','waterbed','stones','rock'] as const;
 field.grassCoverage=Float32Array.from(field.samples,(_,i)=>i%13/12);
 field.rockCoverage=Float32Array.from(field.samples,(_,i)=>i%9/8);
 field.surfacePaint=Array.from({length:28},(_,p)=>({owner:String(p),material:p%7===6?'unrecognized':biomeTerrainTile(biome,channels[p%7]).ar,weights:Float32Array.from(field.samples,(_,i)=>i%(p+2)?0:i%17/16)}));
 const actual=authoredTerrain(field,[],[]),expected=Array.from({length:5},()=>new Uint8Array(field.samples.length));
 for(let i=0;i<field.samples.length;i++){
  let grass=field.grassCoverage[i],road=0,bed=0,stones=0,rock=field.rockCoverage[i];
  for(const paint of field.surfacePaint){
   const c=channels.findIndex(channel=>biomeTerrainTile(biome,channel).ar===paint.material),w=paint.weights[i];if(c<0||w<=0)continue;
   grass=grass*(1-w)+(c===1?w:0);road=road*(1-w)+(c===2?w:0);bed=bed*(1-w)+(c===3?w:0);stones=stones*(1-w)+(c===4?w:0);rock=rock*(1-w)+(c===5?w:0);
  }
  const x=field.origin+i%field.verts,z=field.origin+Math.floor(i/field.verts);
  rock=Math.max(rock,Math.min(1,Math.max(0,Math.hypot(field.sample(x+.5,z)-field.sample(x-.5,z),field.sample(x,z+.5)-field.sample(x,z-.5))-.7)));
  [grass,road,bed,stones,rock].forEach((v,c)=>expected[c][i]=Math.round(v*255));
 }
 for(let c=0;c<5;c++)expect(actual.layers[c+1].mask).toBe(Buffer.from(expected[c]).toString('base64'));
});
